//! Installed Native Workbench entry point.

#![forbid(unsafe_code)]

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
compile_error!("composition currently supports desktop hosts only");

use anyhow::{Context, Result, bail};
use directories::ProjectDirs;
use integration::try_acquire_instance_lock;

fn main() -> Result<()> {
    if std::env::args_os().nth(1).is_some() {
        bail!("Usage: native-workbench");
    }

    let user_directories = ProjectDirs::from("org", "apple-code", "native-workbench")
        .context("The current user's application-data directory is unavailable")?;
    let instance_lock_path = user_directories.data_local_dir().join("instance.lock");

    // Acquire ownership before creating workers or opening native resources.
    let Some(instance_lock) = try_acquire_instance_lock(&instance_lock_path)
        .with_context(|| format!("Cannot acquire {}", instance_lock_path.display()))?
    else {
        // This is duplicate suppression, not a readiness or identity handshake.
        eprintln!("A Native Workbench startup owner already exists.");
        return Ok(());
    };

    // Retain process ownership until the service's Tokio runtime and native
    // event processing have stopped, including during unwinding.
    let service_result = filesystem_service::run();
    drop(instance_lock);
    service_result
}
