use std::{sync::Arc, time::Duration};

use filesystem_native::NativeSelection;
use filesystem_protocol::{FileError, Request, Response};
use tokio::time::timeout;

use crate::{picker::PickMode, server::handler::Handler};

use super::selection_with_file;

const TEST_TIMEOUT: Duration = Duration::from_secs(5);

/// Reject a file picker result when the native selection owner is released
/// while the request is pending. The late result must not restore selection.
///
/// ```text
/// Existing file selected
///   → picker request accepted
///   → native selection owner released
///   → picker returns a valid file path
///   → request rejected; owner remains unavailable
/// ```
#[tokio::test]
async fn file_picker_result_after_owner_shutdown_is_rejected() -> anyhow::Result<()> {
    // 1. Begin with an existing selection and a real file for the picker to return.
    let native_selection = selection_with_file()?;
    let (picker, dispatcher) = crate::picker::channel();
    let handler = Handler::new(picker, native_selection);
    let picker_file = tempfile::NamedTempFile::new()?;

    // 2. Release the native selection owner before the picker callback returns a path.
    let shared_selection = Arc::clone(&handler.selection);
    let dispatcher_task = tokio::spawn(dispatcher.run_with(move |requested_mode| {
        assert_eq!(requested_mode, PickMode::File);
        shared_selection
            .try_lock()
            .expect("the handler must not hold the selection lock while awaiting the picker")
            .shutdown();
        Some(picker_file.path().to_path_buf())
    }));

    // 3. Reject the returned path and keep the native selection owner unavailable.
    assert_eq!(
        handler.dispatch(Request::ChooseFile).await?,
        Response::Failed(FileError::Cancelled)
    );
    assert_eq!(
        handler.dispatch(Request::CurrentSelection).await?,
        Response::Failed(FileError::Cancelled)
    );

    // 4. Close the request channel so the dispatcher can finish.
    drop(handler);
    dispatcher_task.await?;
    Ok(())
}

/// Verify that an abandoned selection request does not leave the blocking
/// worker stuck. The request is `Request::CurrentSelection`.
///
/// The test acquires the selection lock and keeps it held.
/// The selection request waits for that same lock.
///
/// The test and selection request share the async thread.
///
/// This uses `#[test]` because `#[tokio::test]` does not accept
/// `max_blocking_threads`. Its `worker_threads` option controls async
/// scheduler threads, not the blocking pool.
///
/// | Runtime setup | Async execution | Blocking thread limit |
/// | --- | --- | --- |
/// | Default `#[tokio::test]` | Current thread | Tokio's default |
/// | Explicit builder here | Current thread | 1 |
///
/// The builder configures runtime drivers and blocking threads separately:
///
/// | Setting | Purpose in this test |
/// | --- | --- |
/// | `.enable_time()` | Enables the timer driver used by `timeout(...)`. |
/// | `.max_blocking_threads(1)` | Limits the pool used by `spawn_blocking(...)` to one thread. |
///
/// One blocking worker ensures that another worker cannot hide a request
/// occupying the blocking pool while waiting for the selection lock.
///
/// Expected sequence; all lock operations refer to the selection lock:
///
/// ```text
/// +-------------------------------------------+   +---------------------+
/// |               Async thread                |   |    Blocking pool    |
/// |        Test            Selection request  |   |     Only worker     |
/// +----------+---------------------+----------+   +----------+----------+
///            |                     |                         |
///            | Acquire lock        |                         |
///            |                     |                         |
///            |--- Poll request --->|                         |
///            |< Waiting for lock --|                         |
///            |--- Drop request --->X                         |
///            |                                               |
///            | Keep lock held                                |
///            |------------ Submit unrelated task ----------->|
///            |<--------------- Task finished ----------------|
///            |                                               |
///            | Release lock                                  |
/// ```
///
/// X marks where the selection request is dropped.
/// The unrelated task must finish while the test still holds the lock.
/// If the abandoned request left a job waiting for that lock inside the
/// blocking worker, the worker could not run the unrelated task.
/// The test would time out.
#[test]
fn waiting_requests_do_not_occupy_blocking_workers() {
    // 1. Allow only one blocking worker so another cannot hide a stuck job.
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .max_blocking_threads(1)
        .build()
        .unwrap();
    runtime.block_on(async {
        // 2. Create a handler with an empty selection and acquire the selection lock.
        let native_selection = NativeSelection::default();
        let (picker, _) = crate::picker::channel();
        let handler = Handler::new(picker, native_selection);
        let selection_guard = handler.selection.lock().await;

        // 3. Poll the request once, then drop it while keeping the selection lock held.
        // An unpolled future would never exercise the handler.
        let mut request = Box::pin(handler.dispatch(Request::CurrentSelection));
        assert!(futures::poll!(&mut request).is_pending());
        drop(request);

        // 4. Submit an unrelated blocking task and wait while the lock stays held.
        let blocking_task = tokio::task::spawn_blocking(|| ());
        let blocking_result = timeout(TEST_TIMEOUT, blocking_task).await;

        // 5. Release the lock even after a timeout, then check the task result.
        // This lets a stuck job finish so runtime shutdown can proceed.
        drop(selection_guard);
        blocking_result
            .expect("unrelated blocking task should finish while the selection lock is held")
            .unwrap();
    });
}
