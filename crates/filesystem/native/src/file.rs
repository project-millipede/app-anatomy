use std::{fs::File, io};

#[cfg(unix)]
use std::os::unix::fs::FileExt;
#[cfg(windows)]
use std::os::windows::fs::FileExt;

use binary_inspection::input::{ByteSource, SourceError};

/// An owned regular file supplying reads at explicit absolute offsets.
///
/// The declared length is captured once from the open handle. Reads observe live
/// contents: retaining a handle prevents pathname replacement from choosing a
/// different file, but does not prevent in-place edits or truncation. A length
/// and an open handle do not establish a consistent snapshot.
///
/// 1. Bounded reads on both platforms.
/// Reads from a zero-based byte offset directly into the caller's buffer.
/// A successful read may supply fewer bytes than the buffer can hold.
/// This source adds no staging buffer, path reopening or retry loop.
/// Native I/O errors pass through; an empty buffer returns zero without file I/O.
///
/// 2. Unix, including macOS: preserve the file cursor.
/// Uses the platform's positional `FileExt::read_at` operation. The requested
/// offset determines where reading starts; the shared cursor remains unchanged.
/// For example, reading four bytes at offset 8 leaves a prior cursor of 13 at 13.
///
/// 3. Windows: update the shared file cursor.
/// Uses `FileExt::seek_read`. The requested offset determines where reading
/// starts; the cursor moves to the end of the returned bytes, even after a
/// short read. Reading four bytes at offset 8 therefore leaves the cursor at 12.
/// Handles created with `File::try_clone` share that cursor. Coordinate these
/// offset reads with cursor-dependent reads, writes and seeks through any
/// handle sharing the cursor.
///
/// 4. Separate native acquisition from analysis policy.
/// [`binary_inspection::inspect_source`] validates analysis ranges against the
/// declared length and completes short successful reads. Direct source calls
/// observe live file contents, including edits, truncation and bytes appended
/// beyond the captured length.
///
/// Dropping this source closes its owned handle. The source neither duplicates
/// that handle nor closes any independent handles retained by the caller.
///
/// # Examples
///
/// A consuming Rust library can accept `S: ByteSource` by value. Passing a mutable
/// reference makes `S = &mut NativeFileSource`; the caller retains ownership of
/// the native source and its file handle.
///
/// ```no_run
/// use std::fs::File;
///
/// use binary_inspection::{
///     BinaryReport, InspectionError, input::ByteSource, inspect_source,
/// };
/// use filesystem_native::NativeFileSource;
///
/// // 1. Example consumer API: accept a source value implementing ByteSource.
/// fn inspect_input<S: ByteSource>(mut source: S) -> Result<BinaryReport, InspectionError> {
///     inspect_source(&mut source)
/// }
///
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// // 2. Keep the native source and its file under the caller's ownership.
/// let mut native_source = NativeFileSource::new(File::open("input.bin")?)?;
///
/// // 3. Pass a borrow as the consumer's source value: S = &mut NativeFileSource.
/// let result = inspect_input(&mut native_source);
///
/// // 4. Reuse the owner whether the preceding inspection succeeded or failed.
/// let next_result = inspect_input(&mut native_source);
/// # let _ = (result, next_result);
/// # Ok(())
/// # }
/// ```
///
/// Direct calls to [`binary_inspection::inspect_source`] already accept a mutable
/// borrow through `&mut Source`. The forwarding implementation for
/// `&mut NativeFileSource` supports consumers whose generic source value is itself
/// a reference, as in the example above.
#[derive(Debug)]
pub struct NativeFileSource {
    file: File,
    byte_length: u64,
}

impl NativeFileSource {
    /// Take ownership of an already-open regular file and capture its length.
    ///
    /// The caller supplies a readable, synchronous file handle. Opening policy,
    /// path permissions and consistency guarantees belong to that caller. This
    /// source exposes only reads, even if the supplied handle can also write.
    ///
    /// # Errors
    ///
    /// Preserves metadata-query errors and rejects nonregular files with
    /// [`io::ErrorKind::InvalidInput`]. Read permission is checked by the operating
    /// system on each read, not by this constructor. On error the supplied handle
    /// is dropped as well.
    pub fn new(file: File) -> io::Result<Self> {
        let metadata = file.metadata()?;
        if !metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Native input must be a regular file",
            ));
        }
        Ok(Self {
            file,
            byte_length: metadata.len(),
        })
    }
}

impl ByteSource for NativeFileSource {
    fn byte_length(&self) -> u64 {
        self.byte_length
    }

    fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
        if destination.is_empty() {
            return Ok(0);
        }
        #[cfg(unix)]
        let result = self.file.read_at(destination, offset);
        #[cfg(windows)]
        let result = self.file.seek_read(destination, offset);
        result.map_err(SourceError::from)
    }
}

// 1. Support direct Rust consumers taking `source: S` where `S: ByteSource`.
// When S is `&mut NativeFileSource`, the reference itself must implement ByteSource.
// Direct inspection already accepts `&mut NativeFileSource` through `&mut Source`.
//
// 2. Let those consumers use a retained file through an exclusive borrow.
// The caller keeps ownership of NativeFileSource and its handle. After the borrow
// ends, the source remains available for later reads or inspections.
//
// 3. Forward reads and length queries to NativeFileSource's implementation.
// Both source forms use the same native behavior.
impl ByteSource for &mut NativeFileSource {
    fn byte_length(&self) -> u64 {
        NativeFileSource::byte_length(self)
    }

    fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
        NativeFileSource::read_at(self, offset, destination)
    }
}
