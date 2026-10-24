//! Native executable composition: no JavaScript, component runtime or WIT.
fn main() -> anyhow::Result<()> {
    use anyhow::Context;
    use workbench_native::NativeTransport;
    use workbench_operations::Session;
    let mut args = std::env::args().skip(1);
    let endpoint = args.next().context("Expected endpoint argument")?;
    let mut session = Session::new(Box::new(NativeTransport::new(endpoint)?));
    let resource = session
        .current_selection()?
        .file
        .context("No native file is selected")?
        .resource;
    let outcome = session.inspect(&resource);
    let step = outcome
        .steps
        .into_iter()
        .next()
        .context("No inspection result returned")?;
    let report = step.result?;
    println!(
        "byte_length={} images={}",
        report.byte_length,
        report.images.len()
    );
    Ok(())
}
