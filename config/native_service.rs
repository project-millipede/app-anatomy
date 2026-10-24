//! Shared application address. Rebuild the service and component after changing it.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};

pub const ADDRESS: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 3211);
