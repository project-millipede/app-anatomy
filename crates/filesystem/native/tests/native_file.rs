#![cfg(unix)]
#![forbid(unsafe_code)]

use std::fs::File;

use filesystem_native::NativeFileSource;

#[test]
fn directories_are_rejected_before_reading() {
    let directory = tempfile::tempdir().unwrap();
    let result = NativeFileSource::new(File::open(directory.path()).unwrap());
    let error = match result {
        Ok(_) => panic!("a directory was accepted as a regular file"),
        Err(error) => error,
    };
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
}
