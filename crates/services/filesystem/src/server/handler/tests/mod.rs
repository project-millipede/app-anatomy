mod lifecycle;
mod selection;

use std::io::Write;

use filesystem_native::{NativeFileSource, NativeSelection};

/// Create a native selection retaining a real temporary file.
fn selection_with_file() -> std::io::Result<NativeSelection> {
    let file_name: String = String::from("existing-file");
    let file_contents: &[u8] = b"native bytes";

    let mut file = tempfile::tempfile()?;
    file.write_all(file_contents)?;
    let source = NativeFileSource::new(file)?;

    let mut selection = NativeSelection::default();
    selection.install_file(file_name, source);

    Ok(selection)
}

/// Create a temporary directory with entries at two levels.
///
/// ```text
/// temporary directory/          (level 0)
/// ├── level-1-file              contains "level-1 contents"
/// └── level-1-directory/
///     └── level-2-file          contains "level-2 contents"
/// ```
///
/// Keep the returned directory owner alive while using its entries.
fn directory_with_entries() -> std::io::Result<tempfile::TempDir> {
    let root_directory = tempfile::tempdir()?;
    let level_1_directory_path = root_directory.path().join("level-1-directory");
    let level_1_file_contents: &[u8] = b"level-1 contents";
    let level_2_file_contents: &[u8] = b"level-2 contents";

    std::fs::create_dir(&level_1_directory_path)?;
    std::fs::write(
        root_directory.path().join("level-1-file"),
        level_1_file_contents,
    )?;
    std::fs::write(
        level_1_directory_path.join("level-2-file"),
        level_2_file_contents,
    )?;

    Ok(root_directory)
}
