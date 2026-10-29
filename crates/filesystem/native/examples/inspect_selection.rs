//! Persistent native ownership and repeated inspection without a service or Wasm.
use binary_inspection::{inspect_dependencies_source, inspect_source};
use filesystem_native::NativeSelection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let path = args.next().ok_or("Expected a native file path")?;
    let dependencies = match args.next().as_deref() {
        None => false,
        Some(flag) if flag == "--dependencies" => true,
        _ => return Err("Expected optional --dependencies flag".into()),
    };
    if args.next().is_some() {
        return Err("Unexpected argument".into());
    }
    let mut selection = NativeSelection::default();
    selection.select_file(path)?;
    for _ in 0..2 {
        let source = selection.file_mut().ok_or("No native file selected")?;
        let report = if dependencies {
            inspect_dependencies_source(source)?
        } else {
            inspect_source(source)?
        };
        println!(
            "byte_length={} images={}",
            report.byte_length,
            report.images.len()
        );
        for image in &report.images {
            if let Some(evidence) = &image.dependencies {
                println!(
                    "libraries={} imports={} runpaths={} install_names={}",
                    evidence.libraries.len(),
                    evidence.imports.len(),
                    evidence.runpaths.len(),
                    evidence.install_names.len()
                );
            }
        }
    }
    Ok(())
}
