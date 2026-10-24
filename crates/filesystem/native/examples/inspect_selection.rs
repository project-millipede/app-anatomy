//! Persistent native ownership and repeated inspection without a service or Wasm.
use binary_inspection::inspect_source;
use filesystem_native::NativeSelection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args_os()
        .nth(1)
        .ok_or("Expected a native file path")?;
    let mut selection = NativeSelection::default();
    selection.select_file(path)?;
    for _ in 0..2 {
        let source = selection.file_mut().ok_or("No native file selected")?;
        let report = inspect_source(source)?;
        println!(
            "byte_length={} images={}",
            report.byte_length,
            report.images.len()
        );
    }
    Ok(())
}
