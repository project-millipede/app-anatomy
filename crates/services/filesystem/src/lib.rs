//! Native filesystem service exposed through an ordinary Rust entry point.

#![forbid(unsafe_code)]

#[path = "../../../../config/native_service.rs"]
mod native_service;
mod picker;
mod read;
mod selection;
mod server;

use anyhow::Context;
use filesystem_native::NativeSelection;

/// Run native selection, dialogs and filesystem networking until shutdown.
///
/// Call on the OS main thread without an entered Tokio runtime or a GUI
/// framework owning native event processing. On macOS, rfd processes native
/// events on main while the service runs on its worker. Other platforms run
/// the service on the calling thread. The service owns its Tokio runtime;
/// installation and process ownership remain the caller's responsibility.
pub fn run() -> anyhow::Result<()> {
    let service = || {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .context("Cannot initialize the native service runtime")?;

        // Runtime teardown finishes before this closure returns and rfd stops
        // processing native events, including when service work unwinds.
        runtime.block_on(serve())
    };

    #[cfg(target_os = "macos")]
    {
        let service_result = rfd::macos::run_with_native_events(service)?;
        service_result
    }
    #[cfg(not(target_os = "macos"))]
    {
        service()
    }
}

async fn serve() -> anyhow::Result<()> {
    let native_selection = NativeSelection::default();
    let (dialog_requests, dialog_dispatcher) = picker::channel();

    // Keep the serial picker on this runtime's calling thread. Networking runs
    // on Tokio workers; the dispatcher exits when its request senders are dropped.
    let networking_task = tokio::spawn(server::run(dialog_requests, native_selection));
    dialog_dispatcher.run().await;

    // Preserve the service's shutdown result after its dialog dispatcher exits.
    networking_task.await?
}
