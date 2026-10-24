# Selection acquisition and lock ownership

This document follows `Handler::choose()` in [`handler.rs`](src/server/handler.rs): a
native dialog supplies a path, a blocking worker acquires the resource, and the
awaiting request installs it. The service retains the previous selection until
successful replacement or service shutdown. See the [service README](README.md)
for the protocol, launch instructions and overall resource lifecycle.

## What the guard owns

The service stores its selection in `Arc<Mutex<Selection>>`.
`OwnedMutexGuard<Selection>` keeps that shared mutex alive and locked until the
guard is dropped. `Selection` stays inside the mutex. Moving the guard transfers
exclusive access and responsibility for unlocking; each handoff keeps the same
lock held continuously. This mutex coordinates service access to retained state
and native resources; it is not an operating-system file lock.

The worker returns both its acquisition result and that guard:

```rust
struct Acquisition {
    resource: Result<AcquiredResource, SourceError>,
    selection: OwnedMutexGuard<Selection>,
}
```

`AcquiredResource` owns either an opened file or a directory path with its captured
bounded listing. It has not yet replaced the retained selection. The
`Acquisition` value keeps exclusive native access through installation or cleanup.

## Successful acquisition

```mermaid
sequenceDiagram
    participant R as choose() request
    participant P as Native picker
    participant M as Selection mutex
    participant W as Blocking worker
    participant T as Tokio task output

    R->>M: 1. Check availability
    M-->>R: Release temporary lock

    R->>P: 2. Await dialog
    Note over R,M: No selection lock held during dialog
    P-->>R: Selected path

    R->>M: 3. lock_owned().await
    M-->>R: OwnedMutexGuard
    R->>R: Recheck availability

    R->>W: 4. spawn_blocking - move guard
    Note over M,W: Mutex remains locked
    W->>W: Open file or capture directory listing
    W-->>T: Acquisition containing resource and guard
    Note over M,T: Worker finished; output still holds the lock

    T-->>R: Await completes - move resource and guard
    Note over R: No further await
    R->>M: 5. Install resource using guard
    Note over R,M: Successful installation replaces previous selection
    R->>M: Drop guard and unlock
```

1. **Check availability.** A short initial lock checks that the owner has not
   stopped before opening a dialog.
2. **Await the native dialog.** [`Picker`](src/picker.rs) queues the request for
   the serial dispatcher. On macOS, rfd presents the panel on the OS main thread
   while the serial dispatcher waits on rfd's worker. No selection lock is held
   while the user chooses.
   Native-dialog Cancel returns `SelectedFile(None)` or `SelectedDirectory(None)`
   and preserves the previous selection.
3. **Await native access.** `lock_owned().await` waits asynchronously before any
   blocking job is submitted. The request rechecks owner availability under the
   acquired guard because shutdown may have occurred while the dialog was open.
4. **Acquire without replacing.** The guard moves into `spawn_blocking`.
   `acquire_resource()` opens and validates the file or captures the directory
   listing. The worker returns `Acquisition`; the guard stays in Tokio's task
   output until that output is consumed or discarded. Worker completion alone
   does not release the lock.
5. **Install in the awaiting request.** After the worker's result arrives,
   `AcquiredResource::install()` transfers the resource to
   [`Selection`](src/selection.rs). Installation updates ownership and resource
   identifiers and drops the previous resources. There is no further `.await`
   between receiving the result and installation. Returning drops the remaining
   guard and unlocks the mutex.

An acquisition failure leaves the previous selection intact. Acquisition and
installation errors remain the inner `Result<_, SourceError>` and follow
`dispatch()`'s existing response/error conversion. A blocking-task failure, such
as a panic, follows the outer `anyhow::Result` through the `JoinError`.

## Abandoned acquisition and shutdown

Here, **abandonment** means the service drops the pending request future. This is
different from the user pressing Cancel in the native dialog. The diagram starts
with acquisition already running and shutdown dropping its connection task.

```mermaid
sequenceDiagram
    participant S as Service shutdown
    participant R as Request
    participant W as Blocking worker
    participant T as Tokio task output
    participant M as Selection mutex

    Note over W,M: Worker owns the guard; mutex locked

    S->>R: Abort and await connection tasks
    R->>T: Request dropped; JoinHandle dropped
    Note over W,T: Running blocking acquisition continues

    S->>M: Cleanup worker waits in blocking_lock()

    W->>W: Finish acquisition
    W-->>T: Acquisition containing resource and guard
    Note over T: No awaiting request remains
    T->>T: 1. Drop unused resource
    Note over T,M: Mutex remains locked during cleanup
    T->>M: 2. Drop guard and unlock

    M-->>S: Cleanup worker acquires lock
    S->>M: Shut down retained selection
    S->>M: Drop cleanup guard and unlock
```

1. **Abandoned before worker submission.** A dropped request waiting for the
   dialog or native-access mutex submits no acquisition job. The picker discards
   an abandoned dialog result; an already-visible panel still needs user dismissal.
2. **Abandoned after submission.** Dropping the `JoinHandle` detaches the blocking
   job. Its unused output is discarded, whether the job finishes before or after
   the handle is dropped. The worker cannot install a selection.
3. **Clean up before unlocking.** Rust drops struct fields in declaration order.
   `Acquisition.resource` must precede `Acquisition.selection`, so an unused file
   or directory value is dropped before the owned guard releases the lock.
4. **Shutdown waits for cleanup.** `stop_service()` in
   [`server/mod.rs`](src/server/mod.rs) aborts and awaits connection tasks, then
   awaits `Handler::shutdown()`. The handler submits blocking cleanup, which waits
   for native access before calling `Selection::shutdown()`. A worker or unused
   output still holding the guard keeps shutdown waiting until acquisition and
   resource cleanup finish.

Once the request resumes after the worker completes, synchronous installation has
no suspension point. Cancellation does not interrupt code already executing that
installation. A completed replacement remains retained even if sending its reply
later fails.

## Boundaries to preserve

- Keep explicit file opening, metadata checks and directory enumeration in the
  blocking acquisition worker. Keep installation in the awaiting request.
- Keep the guard continuously held through acquisition, output storage and
  installation or unused-resource cleanup. Preserve the `Acquisition` field order
  and the absence of another `.await` before installation.
- Native work and selection exchanges have no application deadline. Dropping the
  request does not forcibly interrupt a running filesystem operation.
- The connection handler does not concurrently monitor socket disconnect during
  dispatch. Browser disposal or socket loss alone does not establish that the
  service abandoned the request or rolled back a replacement.

For ordinary queries, reads and child opens, the worker performs `operate()` while
holding the guard and releases it when the job finishes. Picker acquisition needs
the additional return handoff because only the still-awaited request may install
the replacement.
