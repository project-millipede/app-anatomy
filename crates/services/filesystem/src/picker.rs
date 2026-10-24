//! Serialize synchronous native dialog requests; rfd handles native presentation.

use std::{io, path::PathBuf, sync::Arc};

use binary_inspection::input::SourceError;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc, oneshot};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PickMode {
    File,
    Folder,
}

struct Request {
    mode: PickMode,
    response: oneshot::Sender<Option<PathBuf>>,
    // Keep the permit even if the request caller stops waiting. A visible dialog
    // must be dismissed before another one may be opened.
    _permit: OwnedSemaphorePermit,
}

#[derive(Clone)]
pub struct Picker {
    sender: mpsc::Sender<Request>,
    available: Arc<Semaphore>,
}

pub struct DialogDispatcher {
    receiver: mpsc::Receiver<Request>,
}

pub fn channel() -> (Picker, DialogDispatcher) {
    let (sender, receiver) = mpsc::channel(1);
    (
        Picker {
            sender,
            available: Arc::new(Semaphore::new(1)),
        },
        DialogDispatcher { receiver },
    )
}

impl Picker {
    pub async fn choose(&self, mode: PickMode) -> Result<Option<PathBuf>, SourceError> {
        let permit = Arc::clone(&self.available)
            .try_acquire_owned()
            .map_err(|_| {
                io::Error::new(io::ErrorKind::WouldBlock, "A native dialog is already open")
            })?;
        let (response, received) = oneshot::channel();
        self.sender
            .send(Request {
                mode,
                response,
                _permit: permit,
            })
            .await
            .map_err(|_| SourceError::Cancelled)?;
        received.await.map_err(|_| SourceError::Cancelled)
    }
}

impl DialogDispatcher {
    /// Run serial dialog requests on the service's calling thread.
    /// On macOS, rfd forwards native calls to its running main-thread loop.
    pub async fn run(self) {
        self.run_with(|mode| match mode {
            PickMode::File => rfd::FileDialog::new()
                .set_title("Choose a file to analyze")
                .pick_file(),
            PickMode::Folder => rfd::FileDialog::new()
                .set_title("Choose a folder to inspect")
                .pick_folder(),
        })
        .await;
    }

    pub(crate) async fn run_with(mut self, mut choose: impl FnMut(PickMode) -> Option<PathBuf>) {
        while let Some(request) = self.receiver.recv().await {
            if request.response.is_closed() {
                continue;
            }
            let path = choose(request.mode);
            // rfd cannot dismiss an already-visible panel programmatically.
            // Shutdown or request abandonment invalidates the eventual result;
            // the user still has to dismiss an already-visible panel.
            if !request.response.is_closed() {
                let _ = request.response.send(path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Build dispatcher input directly; this does not exercise Picker::choose.
    // Keep the real response channel and owned dialog permit.
    fn queue_request(picker: &Picker) -> oneshot::Receiver<Option<PathBuf>> {
        let (response, received) = oneshot::channel();
        let permit = Arc::clone(&picker.available).try_acquire_owned().unwrap();
        picker
            .sender
            .try_send(Request {
                mode: PickMode::File,
                response,
                _permit: permit,
            })
            .expect("test request must fit in the empty queue");
        received
    }

    // TODO: Improve documentation of the dismissal-then-selection sequence and dispatcher reuse.
    #[tokio::test]
    async fn no_selection_is_neutral_and_repeated_requests_work() {
        let (picker, dispatcher) = channel();
        let task = tokio::spawn(async move {
            let mut calls = 0;
            dispatcher
                .run_with(|_| {
                    calls += 1;
                    (calls == 2).then(|| PathBuf::from("chosen"))
                })
                .await;
            calls
        });
        assert!(picker.choose(PickMode::File).await.unwrap().is_none());
        assert_eq!(
            picker.choose(PickMode::File).await.unwrap(),
            Some(PathBuf::from("chosen"))
        );
        drop(picker);
        assert_eq!(task.await.unwrap(), 2);
    }

    // Queue a request, abandon its response, then run the real dispatcher.
    // The dispatcher must discard the request without invoking the dialog.
    #[tokio::test]
    async fn cancelled_queued_requests_never_show_a_dialog() {
        let (picker, dispatcher) = channel();
        let received = queue_request(&picker);
        // Represent a caller that stopped waiting for its response.
        drop(received);
        // Close the request channel so run_with exits after draining it.
        drop(picker);
        dispatcher
            .run_with(|_| panic!("cancelled request must be skipped"))
            .await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cancellation_keeps_dialog_permit_until_native_dialog_returns() {
        let (picker, dispatcher) = channel();
        let (entered, ready) = oneshot::channel();
        let (dismiss, dismissed) = std::sync::mpsc::channel();
        let mut entered = Some(entered);
        let task = tokio::spawn(dispatcher.run_with(move |_| {
            entered.take().unwrap().send(()).unwrap();
            dismissed.recv().unwrap();
            Some(PathBuf::from("late-selection"))
        }));
        let other = picker.clone();
        let request = tokio::spawn(async move { other.choose(PickMode::File).await });
        ready.await.unwrap();
        request.abort();
        let _ = request.await;
        assert!(
            matches!(picker.choose(PickMode::File).await, Err(SourceError::Io(error)) if error.kind() == io::ErrorKind::WouldBlock)
        );
        dismiss.send(()).unwrap();
        drop(picker);
        task.await.unwrap();
    }
}
