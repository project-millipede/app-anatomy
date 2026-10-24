//! Process exclusion for a caller-selected path using the standard library's file lock.

use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io,
    path::Path,
};

/// Attempt exclusive ownership of a caller-selected instance lock.
///
/// Returns `Ok(Some(file))` when acquired. Retain the returned [`File`] until
/// the protected work ends; dropping it releases ownership. `Ok(None)` means
/// lock contention. Directory creation, file opening and other locking errors
/// are returned unchanged.
///
/// Callers choose the identity and scope through a stable path shared by their
/// instances. Do not remove or replace that file while an instance may use it.
/// Parent directories are created as needed; new files use mode `0600` on Unix
/// (subject to the process umask). Existing files retain their permissions.
/// Acquiring this lock does not establish service readiness or forward requests.
pub fn try_acquire_instance_lock(instance_lock_path: &Path) -> io::Result<Option<File>> {
    let parent_directory = instance_lock_path.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "Instance lock needs a parent")
    })?;
    fs::create_dir_all(parent_directory)?;

    // Keep this file in place: replacing its inode could admit another owner.
    let mut open_options = OpenOptions::new();
    open_options
        .read(true)
        .write(true)
        .create(true)
        .truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        open_options.mode(0o600);
    }
    let instance_lock = open_options.open(instance_lock_path)?;

    // File owns the OS lock. Only contention means another owner; propagate
    // permission and I/O failures instead of silently suppressing startup.
    match instance_lock.try_lock() {
        Ok(()) => Ok(Some(instance_lock)),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(error)) => Err(error),
    }
}
