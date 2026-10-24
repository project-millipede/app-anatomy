//! Direct developer entry point for the native filesystem service.

#![forbid(unsafe_code)]

use anyhow::bail;

fn main() -> anyhow::Result<()> {
    if std::env::args_os().nth(1).is_some() {
        bail!("Usage: filesystem-service");
    }

    filesystem_service::run()
}
