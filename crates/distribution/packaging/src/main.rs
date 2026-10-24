//! Select service executables, build them and create native installers.

#![forbid(unsafe_code)]

mod debian;
mod macos;

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use anyhow::{Context, Result, bail, ensure};
use cargo_packager::{
    Config, PackageFormat, PackageOutput,
    config::{Binary, DebianConfig, MacOsConfig, NSISInstallerMode, NsisConfig},
};

// cargo-packager owns packaging metadata. Only Cargo selection belongs here.
struct ServiceBundle {
    selection_name: &'static str,
    cargo_package_name: &'static str,
    package_config: Config,
}

fn service_bundles() -> [ServiceBundle; 1] {
    let mut package_config = Config::default();
    package_config.product_name = "Native Workbench".to_owned();
    package_config.identifier = Some("org.apple-code.native-workbench".to_owned());
    package_config.version = env!("CARGO_PKG_VERSION").to_owned();
    package_config.description = Some("Native filesystem integration".to_owned());
    package_config.authors = Some(vec!["Apple Code Workbench contributors".to_owned()]);
    // Store the executable once in the upstream Binary type, without .exe.
    package_config.binaries = vec![Binary::new("native-workbench").main(true)];

    [ServiceBundle {
        selection_name: "native-workbench",
        cargo_package_name: "composition",
        package_config,
    }]
}

fn package_format_for_current_host() -> Result<PackageFormat> {
    // Choose one format per host. Upstream defaults select multiple artifacts.
    match std::env::consts::OS {
        "macos" => Ok(PackageFormat::App),
        "windows" => Ok(PackageFormat::Nsis),
        "linux" => Ok(PackageFormat::Deb),
        host => bail!("Installer generation is unavailable on {host}"),
    }
}

fn main() -> Result<()> {
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    let [requested_selection] = arguments.as_slice() else {
        bail!("Usage: packaging <--list|native-workbench>");
    };
    let available_bundles = service_bundles();

    if requested_selection == "--list" {
        for service_bundle in &available_bundles {
            println!(
                "{}: {} / {}",
                service_bundle.selection_name,
                service_bundle.cargo_package_name,
                service_bundle.package_config.main_binary_name()?
            );
        }
        return Ok(());
    }

    let selected_bundle = available_bundles
        .into_iter()
        .find(|bundle| bundle.selection_name == requested_selection)
        .context("Unknown installation selection; use --list")?;
    create_selected_installer(selected_bundle)
}

fn create_selected_installer(mut service_bundle: ServiceBundle) -> Result<()> {
    let package_format = package_format_for_current_host()?;
    // The fixed source layout is <workspace>/crates/distribution/packaging.
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .context("Cannot locate the installation workspace")?;
    let native_target = query_native_rust_target(workspace_root)?;
    service_bundle.package_config.target_triple = Some(native_target.clone());

    // 1. Build for the active compiler's host, regardless of ambient Cargo target
    // settings. The same Config supplies the executable to Cargo and packaging.
    let executable_path =
        build_installed_executable(workspace_root, &mut service_bundle, &native_target)?;

    // 2. cargo-packager can replace artifacts and remove scratch files. Give each
    // invocation its own directory so previous successful installers survive.
    let output_parent = workspace_root
        .join("dist/distribution")
        .join(service_bundle.selection_name)
        .join(&native_target);
    fs::create_dir_all(&output_parent)?;
    let packaging_directory = tempfile::Builder::new()
        .prefix("run-")
        .tempdir_in(&output_parent)?;
    let artifact_directory = packaging_directory.path().join("artifacts");
    fs::create_dir(&artifact_directory)?;

    // 3. Retain only a successful result. TempDir cleans this invocation's output
    // if building a package or wrapping the macOS app fails.
    let installer_path = create_native_installer(
        &mut service_bundle.package_config,
        package_format,
        &executable_path,
        &artifact_directory,
    )?;
    let _retained_output_directory = packaging_directory.keep();
    println!("{}", installer_path.display());
    Ok(())
}

fn query_native_rust_target(workspace_root: &Path) -> Result<String> {
    // Query the selected compiler: cargo-packager's fallback synthesizes a target
    // from its own build settings and does not honor this RUSTC override.
    let rustc_executable = std::env::var_os("RUSTC").unwrap_or_else(|| "rustc".into());
    let compiler_output = Command::new(rustc_executable)
        .arg("-vV")
        .current_dir(workspace_root)
        .stderr(Stdio::inherit())
        .output()
        .context("Cannot query the active Rust compiler")?;
    ensure!(
        compiler_output.status.success(),
        "Rust compiler query failed"
    );
    let compiler_details = String::from_utf8(compiler_output.stdout)?;
    compiler_details
        .lines()
        .find_map(|line| line.strip_prefix("host: "))
        .map(str::to_owned)
        .context("The Rust compiler did not report its host target")
}

fn build_installed_executable(
    workspace_root: &Path,
    service_bundle: &mut ServiceBundle,
    native_target: &str,
) -> Result<PathBuf> {
    let package_config = &mut service_bundle.package_config;
    let executable_name = package_config.main_binary_name()?;
    let build_directory = workspace_root
        .join("target/distribution")
        .join(service_bundle.selection_name);
    package_config.binaries_dir = Some(build_directory.join(native_target).join("release"));

    let cargo_executable = std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let build_status = Command::new(cargo_executable)
        .current_dir(workspace_root)
        .args(["build", "--locked", "--release"])
        .args(["--package", service_bundle.cargo_package_name])
        .args(["--bin", executable_name.as_str()])
        .args(["--target", native_target])
        .arg("--target-dir")
        .arg(&build_directory)
        .status()
        .context("Cannot start the selected Cargo build")?;
    ensure!(
        build_status.success(),
        "Service build failed: {build_status}"
    );

    let executable_path = package_config.binary_path(package_config.main_binary()?);
    // Config stores the extensionless path expected by cargo-packager. Cargo's
    // Windows output has .exe; only the actual artifact lookup adds that suffix.
    #[cfg(windows)]
    let executable_path = executable_path.with_extension("exe");
    let executable_metadata = fs::metadata(&executable_path)
        .with_context(|| format!("Missing built executable {}", executable_path.display()))?;
    ensure!(
        executable_metadata.is_file(),
        "Cargo artifact is not a file"
    );
    Ok(executable_path)
}

fn create_native_installer(
    package_config: &mut Config,
    package_format: PackageFormat,
    executable_path: &Path,
    artifact_directory: &Path,
) -> Result<PathBuf> {
    package_config.out_dir = artifact_directory.to_owned();
    package_config.formats = Some(vec![package_format]);

    match package_format {
        PackageFormat::App => {
            // The PNG master is 1254px square. Upstream resizes it to 1024px;
            // the @2x suffix selects the supported 512-point Retina icon type.
            let application_icon_path = concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/assets/application-cutaway@2x.png"
            );
            ensure!(
                Path::new(application_icon_path).is_file(),
                "Missing macOS application icon: {application_icon_path}"
            );
            // Bundle resources and CFBundleIconFile are created before signing.
            package_config.icons = Some(vec![application_icon_path.to_owned()]);

            let mut macos_config = MacOsConfig::default();
            // Keep the installed app visible in the Dock. Background mode sets
            // LSUIElement, which hides it even when an app icon is bundled.
            macos_config.background_app = false;
            package_config.macos = Some(macos_config);
        }
        PackageFormat::Nsis => {
            package_config.nsis =
                Some(NsisConfig::new().install_mode(NSISInstallerMode::CurrentUser));
        }
        PackageFormat::Deb => {
            let package_name = package_config.main_binary_name()?;
            let runtime_dependencies =
                debian::detect_runtime_dependencies(executable_path, &package_name)?;
            let mut debian_config = DebianConfig::new().depends(runtime_dependencies);
            debian_config.package_name = Some(package_name);
            package_config.deb = Some(debian_config);
        }
        unsupported_format => bail!("No installer recipe for {unsupported_format}"),
    }

    let package_outputs = cargo_packager::package(package_config)?;
    let packaged_artifact = require_single_package_output(&package_outputs, package_format)?;
    if package_format != PackageFormat::App {
        return Ok(packaged_artifact);
    }

    // cargo-packager supplies the app bundle. The macOS adapter signs and
    // packages it through Rust libraries, without Apple packaging utilities.
    macos::create_installer(package_config, &packaged_artifact, artifact_directory)
}

fn require_single_package_output(
    package_outputs: &[PackageOutput],
    expected_format: PackageFormat,
) -> Result<PathBuf> {
    let [package_output] = package_outputs else {
        bail!(
            "Expected one package output, received {}",
            package_outputs.len()
        );
    };
    ensure!(
        package_output.format == expected_format,
        "Packager returned a different format than requested"
    );
    let [artifact_path] = package_output.paths.as_slice() else {
        bail!("Expected one artifact for the selected package");
    };
    let artifact_metadata = fs::metadata(artifact_path)
        .with_context(|| format!("Missing package artifact {}", artifact_path.display()))?;
    if expected_format == PackageFormat::App {
        ensure!(artifact_metadata.is_dir(), "Expected a macOS app directory");
        return Ok(artifact_path.clone());
    }

    ensure!(artifact_metadata.is_file(), "Expected an installer file");
    Ok(artifact_path.clone())
}
