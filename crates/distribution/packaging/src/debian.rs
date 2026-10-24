//! Debian dependency metadata derived from the actual built executable.

use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
};

use anyhow::{Context, Result, ensure};

pub(super) fn detect_runtime_dependencies(
    executable_path: &Path,
    package_name: &str,
) -> Result<Vec<String>> {
    // dpkg-shlibdeps needs a Debian package tree. Stage a copy in TempDir so
    // dependency discovery never edits the repository or the built executable.
    let dependency_workspace = tempfile::tempdir()?;
    let debian_directory = dependency_workspace.path().join("debian");
    let package_directory = debian_directory.join(package_name);
    let executable_directory = package_directory.join("usr/bin");
    fs::create_dir_all(&executable_directory)?;
    fs::create_dir_all(package_directory.join("DEBIAN"))?;
    fs::write(
        debian_directory.join("control"),
        format!(
            "Source: composition\n\nPackage: {package_name}\nArchitecture: any\nDescription: Native filesystem integration\n"
        ),
    )?;
    let staged_executable = executable_directory.join(package_name);
    fs::copy(executable_path, &staged_executable)?;

    // Missing library metadata must fail packaging. Keep the tool's diagnostics
    // visible even when dependency discovery succeeds.
    let dependency_output = Command::new("dpkg-shlibdeps")
        .current_dir(dependency_workspace.path())
        .args(["-O", "-dDepends"])
        .arg(&staged_executable)
        .stderr(Stdio::inherit())
        .output()
        .context("Cannot run dpkg-shlibdeps; install dpkg-dev and binutils")?;
    ensure!(
        dependency_output.status.success(),
        "Native library dependency discovery failed: {}",
        dependency_output.status
    );
    let dependency_text = String::from_utf8(dependency_output.stdout)?;
    let dependency_record = dependency_text.trim();
    let mut runtime_dependencies = Vec::new();

    // Preserve dpkg's complete dependency expression, including versions and
    // alternatives. DebianConfig joins list entries with commas; no parser needed.
    // Empty stdout is valid for an executable with no shared-library dependencies.
    if !dependency_record.is_empty() {
        let dependency_expression = dependency_record
            .strip_prefix("shlibs:Depends=")
            .context("Missing shlibs:Depends field")?;
        ensure!(
            !dependency_expression.trim().is_empty()
                && !dependency_expression.contains(['\r', '\n']),
            "Unexpected dpkg-shlibdeps output"
        );
        runtime_dependencies.push(dependency_expression.to_owned());
    }

    // FileChooser portals are loaded at runtime and are not ELF dependencies.
    runtime_dependencies.push("xdg-desktop-portal".to_owned());
    runtime_dependencies.push(
        "xdg-desktop-portal-gtk | xdg-desktop-portal-kde | xdg-desktop-portal-gnome".to_owned(),
    );
    Ok(runtime_dependencies)
}
