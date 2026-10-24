//! WebSocket transport through the component's imported Polymorph operations.
// `wit_bindgen::generate!` in lib.rs generates these Rust imports from upstream
// Polymorph WIT, not TypeScript. In the browser, they call Polymorph's TypeScript
// provider through the component bindings; no Polymorph Wasmtime provider is used.
use crate::polymorph::websocket::{
    connections::Websocket,
    types::{Message, WebsocketState},
};
use workbench_operations as client;

struct SocketTransport {
    socket: Option<Websocket>,
}
pub(crate) fn transport() -> Box<dyn client::Transport> {
    Box::new(SocketTransport { socket: None })
}
async fn connect() -> Result<Websocket, client::Failure> {
    // The provider bounds connection establishment and returns its original error.
    Websocket::connect(
        format!("ws://{}", crate::native_service::ADDRESS),
        Vec::new(),
    )
    .await
    .map_err(|error| client::Failure::transport(client::TransportOperation::Connect, error))
}
impl client::Transport for SocketTransport {
    fn exchange(&mut self, request: Vec<u8>) -> Result<Vec<u8>, client::Failure> {
        wit_bindgen::block_on(async {
            // 1. Discard a cached connection that is no longer open.
            if self
                .socket
                .as_ref()
                .is_some_and(|socket| !matches!(socket.state(), WebsocketState::Open))
            {
                self.socket = None;
            }

            // 2. Connect when no usable socket remains.
            // Polymorph owns the connection deadline; await its result directly.
            if self.socket.is_none() {
                self.socket = Some(connect().await?);
            }

            // 3. Send one encoded binary filesystem request.
            let socket = self.socket.as_ref().expect("connected socket");
            socket
                .send(Message::Binary(request))
                .await
                .map_err(|error| {
                    client::Failure::transport(client::TransportOperation::Send, error)
                })?;

            // 4. Receive one reply and require a binary WebSocket message.
            // Filesystem requests have no application deadline.
            // The Rust client decodes and validates the filesystem response.
            let message = socket.receive().await.map_err(|error| {
                client::Failure::transport(client::TransportOperation::Receive, error)
            })?;

            match message {
                Message::Binary(bytes) => Ok(bytes),
                _ => Err(client::Failure::local(
                    client::TransportOperation::Receive,
                    "Expected one binary response",
                )),
            }
        })
    }
    fn reset(&mut self) {
        self.socket = None;
    }
}
