use filesystem_protocol::MAX_RESPONSE_MESSAGE_BYTES;
use futures::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::{net::TcpStream, time::timeout};
use tokio_websockets::{ClientBuilder, Limits, MaybeTlsStream, Message, WebSocketStream};
use workbench_operations::{Failure, Transport, TransportOperation};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// Synchronous WebSocket transport with its own current-thread Tokio runtime.
///
/// Construct and use it outside an entered Tokio runtime. The first exchange
/// opens the connection. Later exchanges reuse it; reset drops it.
pub struct NativeTransport {
    endpoint: String,
    socket: Option<WebSocketStream<MaybeTlsStream<TcpStream>>>,
    runtime: tokio::runtime::Runtime,
}
impl NativeTransport {
    /// Create the runtime without opening a socket. The backend parses the endpoint on exchange.
    pub fn new(endpoint: String) -> Result<Self, Failure> {
        if tokio::runtime::Handle::try_current().is_ok() {
            return Err(Failure::local(
                TransportOperation::Configure,
                "Call the synchronous filesystem client outside an entered Tokio runtime.",
            ));
        }
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| Failure::transport(TransportOperation::Configure, error))?;
        Ok(Self {
            endpoint,
            socket: None,
            runtime,
        })
    }
}
impl Transport for NativeTransport {
    fn exchange(&mut self, request: Vec<u8>) -> Result<Vec<u8>, Failure> {
        self.runtime.block_on(async {
            if self.socket.is_none() {
                // 1. Configure a new connection and its response-size limit.
                let uri = self.endpoint.parse().map_err(|error| {
                    Failure::local(TransportOperation::Configure, "Invalid endpoint")
                        .with_source(error)
                })?;

                let builder = ClientBuilder::from_uri(uri)
                    .limits(Limits::default().max_payload_len(Some(MAX_RESPONSE_MESSAGE_BYTES)));

                // 2. Client connection deadline: stop waiting for an unresponsive server.
                // Bound connection establishment before any filesystem request is sent.
                // This adapter owns the deadline; the server's timer cannot replace it.
                let (socket, _) = timeout(CONNECT_TIMEOUT, builder.connect())
                    .await
                    .map_err(|error| {
                        Failure::local(
                            TransportOperation::Connect,
                            "WebSocket connection timed out",
                        )
                        .with_source(error)
                    })?
                    .map_err(|error| Failure::transport(TransportOperation::Connect, error))?;

                self.socket = Some(socket);
            }

            // 3. Client request: send one encoded binary filesystem message.
            let socket = self.socket.as_mut().expect("connected socket");
            socket
                .send(Message::binary(request))
                .await
                .map_err(|error| Failure::transport(TransportOperation::Send, error))?;

            // 4. Client response: wait for one binary filesystem reply.
            // Skip WebSocket Ping/Pong messages; they do not complete the exchange.
            // Filesystem requests have no application deadline.
            loop {
                let message = socket
                    .next()
                    .await
                    .ok_or_else(|| {
                        Failure::local(TransportOperation::Receive, "Socket closed before response")
                    })?
                    .map_err(|error| Failure::transport(TransportOperation::Receive, error))?;

                if message.is_ping() || message.is_pong() {
                    continue;
                }

                if !message.is_binary() {
                    return Err(Failure::local(
                        TransportOperation::Receive,
                        "Expected one binary response",
                    ));
                }

                return Ok(message.into_payload().to_vec());
            }
        })
    }
    fn reset(&mut self) {
        self.socket = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    #[test]
    fn native_configuration_rejects_an_entered_tokio_runtime() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        let _entered = runtime.enter();
        let failure = match NativeTransport::new("ws://localhost:8123/files".into()) {
            Ok(_) => panic!("entered Tokio runtime was accepted"),
            Err(failure) => failure,
        };
        assert_eq!(failure.operation(), Some(TransportOperation::Configure));
        assert!(failure.source().is_none());
    }
}
