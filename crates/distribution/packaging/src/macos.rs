//! In-process macOS development signing and installer creation.

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, ensure};
use apple_codesign::{SigningSettings, UnifiedSigner};
use cargo_packager::Config;
use embala_pkg::{DirSpec, FileSpec, PkgSpec};

pub(super) fn create_installer(
    package_config: &Config,
    application_path: &Path,
    artifact_directory: &Path,
) -> Result<PathBuf> {
    // 1. With no signing key, the library creates ad-hoc app signatures. This
    // seals the executable and bundle resources without a certificate or network.
    // Apple's Developer ID trust and notarization are separate release concerns.
    UnifiedSigner::new(SigningSettings::default())
        .sign_path_in_place(application_path)
        .context("Cannot ad-hoc sign the macOS application")?;

    // 2. Include the completed signed bundle, including CodeResources. The
    // upstream specification owns package metadata; no staging copy is needed.
    let application_parent = application_path
        .parent()
        .context("The macOS application has no parent directory")?;
    let mut package_specification = PkgSpec {
        name: package_config.main_binary_name()?,
        display_name: package_config.product_name.clone(),
        identifier: package_config.identifier().to_owned(),
        version: package_config.version.clone(),
        install_location: "/Applications".to_owned(),
        enable_user_home: false,
        files: Vec::new(),
        directories: Vec::new(),
        scripts: None,
    };
    append_application_payload(
        application_path,
        application_parent,
        &mut package_specification,
    )?;

    // 3. embala-pkg writes XAR, BOM, CPIO and XML directly. It emits no bundle
    // relocation entries, keeping installation at /Applications. XAR package
    // signing requires a key and certificate; ad-hoc signing cannot apply here.
    let installer_path = artifact_directory.join(format!(
        "{}-{}.pkg",
        package_specification.name, package_specification.version
    ));
    embala_pkg::build(&package_specification, &installer_path)
        .context("Cannot create the macOS development installer")?;
    eprintln!(
        "Development signing: app ad-hoc signed; installer unsigned. \
         Notarization and stapling skipped: no Developer ID credentials."
    );
    Ok(installer_path)
}

fn append_application_payload(
    source_path: &Path,
    application_parent: &Path,
    package_specification: &mut PkgSpec,
) -> Result<()> {
    // This writer supports regular files and directories. Reject unsupported
    // entries rather than silently following a symlink or changing its meaning.
    let metadata = fs::symlink_metadata(source_path)
        .with_context(|| format!("Cannot inspect {}", source_path.display()))?;
    ensure!(
        metadata.is_file() || metadata.is_dir(),
        "Unsupported installer payload entry {}: expected a regular file or directory",
        source_path.display()
    );
    let relative_path = source_path.strip_prefix(application_parent)?;
    let destination = relative_path
        .to_str()
        .context("Installer payload paths must be UTF-8")?
        .replace(std::path::MAIN_SEPARATOR, "/");
    let mode = payload_permissions(&metadata)?;

    if metadata.is_dir() {
        package_specification.directories.push(DirSpec {
            dest: destination,
            mode,
        });
        for entry in fs::read_dir(source_path)? {
            append_application_payload(&entry?.path(), application_parent, package_specification)?;
        }
        return Ok(());
    }

    package_specification.files.push(FileSpec {
        src: source_path.to_owned(),
        dest: destination,
        mode,
    });
    Ok(())
}

fn payload_permissions(metadata: &fs::Metadata) -> Result<Option<u32>> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mode = metadata.permissions().mode() & 0o7777;
        ensure!(
            mode <= 0o777,
            "Installer payload does not support setuid, setgid or sticky permission bits"
        );
        Ok(Some(mode))
    }

    #[cfg(not(unix))]
    {
        // Without Unix mode bits, the upstream writer infers executable files.
        let _ = metadata;
        Ok(None)
    }
}
