use linera_inspect_schema::InspectionApi;
use linera_witty::wit_generation::{
    FileContentGenerator, StubInstance, WitInterfaceWriter, WitWorldWriter,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let directory = std::env::args_os()
        .nth(1)
        .ok_or("usage: linera-inspect-schema <output-directory>")?;
    std::fs::create_dir_all(&directory)?;
    let interface = std::fs::File::create(std::path::Path::new(&directory).join("native.wit"))?;
    WitInterfaceWriter::new::<InspectionApi<StubInstance>>().generate_file_contents(interface)?;
    let world = std::fs::File::create(std::path::Path::new(&directory).join("world.wit"))?;
    WitWorldWriter::new("wit-inspect:linera", "inspection")
        .export::<InspectionApi<StubInstance>>()
        .generate_file_contents(world)?;
    Ok(())
}
