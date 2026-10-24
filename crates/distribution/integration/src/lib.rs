//! Reusable native operating-system integration for executable compositions.
//!
//! Callers supply application identity and retain ownership for their process
//! lifetime. This library does not select a service or start an event loop.

#![forbid(unsafe_code)]

mod single_instance;

pub use single_instance::try_acquire_instance_lock;
