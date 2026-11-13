//! Bounded file-byte composition from supplied image ranges, without reading files.

use std::collections::HashSet;

use crate::FileRange;

use super::{EntryId, EntryKind, ImageId, Inventory, InventoryError};

/// A supplied byte range associated with one exact recorded image.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImageByteRange {
    /// Image identity in the inventory owning the file.
    pub image: ImageId,
    /// Absolute range within that file; its end is exclusive.
    pub file_range: FileRange,
}

/// One image range or a complementary region not assigned to a supplied image.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileByteRegion {
    /// Exact image identity, or none for other / unmapped bytes.
    pub image: Option<ImageId>,
    /// Absolute nonempty range within the file; its end is exclusive.
    pub file_range: FileRange,
}

/// Ordered regions spanning a supplied file length without inferring its format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileByteLayout {
    /// Complete supplied file length, independent of memory usage.
    pub byte_length: u64,
    /// Nonoverlapping regions in offset order; empty for a zero-byte file.
    pub regions: Vec<FileByteRegion>,
}

impl Inventory {
    /// Validate supplied image spans and partition the complete file into regions.
    ///
    /// `entry` identifies a regular file in this inventory. `byte_length` is its
    /// recorded length, and `image_ranges` may omit images whose ranges are unknown.
    /// Inputs are borrowed; the result owns image identities and byte coordinates.
    /// Each image remains distinct even when several declare the same CPU identity.
    /// Unassigned bytes are not classified as padding, headers or resources.
    ///
    /// # Errors
    /// Returns [`InventoryError`] for an unknown or non-file entry, unknown images,
    /// images belonging to another entry, repeated image IDs, empty image spans,
    /// overlapping spans or a range extending beyond the supplied file length.
    /// No filesystem access, container detection or binary parsing is performed.
    pub fn file_byte_layout(
        &self,
        entry: EntryId,
        byte_length: u64,
        image_ranges: &[ImageByteRange],
    ) -> Result<FileByteLayout, InventoryError> {
        let file = self
            .entry(entry)
            .ok_or_else(|| InventoryError("file byte layout entry is missing or foreign".into()))?;
        if file.kind != EntryKind::File {
            return Err(InventoryError(
                "file byte layout requires a regular file entry".into(),
            ));
        }

        let mut ordered_ranges: Vec<_> = image_ranges.iter().collect();
        ordered_ranges.sort_by_key(|image_range| image_range.file_range.offset());
        let mut seen_images = HashSet::new();
        let mut regions = Vec::new();
        let mut next_offset = 0;
        for image_range in ordered_ranges {
            let image = self.image(image_range.image).ok_or_else(|| {
                InventoryError("file byte range image is missing or foreign".into())
            })?;
            if image.entry != entry {
                return Err(InventoryError(
                    "file byte range image belongs to another entry".into(),
                ));
            }
            if !seen_images.insert(image.id) {
                return Err(InventoryError(
                    "file byte ranges repeat an image identity".into(),
                ));
            }
            let file_range = image_range.file_range;
            if file_range.size() == 0 {
                return Err(InventoryError("image byte range is empty".into()));
            }
            if file_range.end() > byte_length {
                return Err(InventoryError(
                    "image byte range extends beyond the file length".into(),
                ));
            }
            if file_range.offset() < next_offset {
                return Err(InventoryError("image byte ranges overlap".into()));
            }
            if file_range.offset() > next_offset {
                let gap = FileRange::new(next_offset, file_range.offset() - next_offset)
                    .ok_or_else(|| InventoryError("unmapped byte range overflows".into()))?;
                regions.push(FileByteRegion {
                    image: None,
                    file_range: gap,
                });
            }
            regions.push(FileByteRegion {
                image: Some(image.id),
                file_range,
            });
            next_offset = file_range.end();
        }
        if next_offset < byte_length {
            let gap = FileRange::new(next_offset, byte_length - next_offset)
                .ok_or_else(|| InventoryError("unmapped byte range overflows".into()))?;
            regions.push(FileByteRegion {
                image: None,
                file_range: gap,
            });
        }
        Ok(FileByteLayout {
            byte_length,
            regions,
        })
    }
}
