//! Service lifecycle and shared filesystem messages over WebSocket.

mod handler;

use std::{
    io::{self, Write},
    net::SocketAddr,
    time::Duration,
};

use anyhow::Context;
use filesystem_native::NativeSelection;
use filesystem_protocol::{MAX_REQUEST_MESSAGE_BYTES, Request, decode_request, encode_response};
use futures::{SinkExt, StreamExt};
use tokio::{
    net::{TcpListener, TcpStream},
    task::JoinSet,
    time::timeout,
};
use tokio_websockets::{CloseCode, Limits, Message, ServerBuilder, WebSocketStream};

#[cfg(unix)]
use tokio::signal::unix::Signal as Interrupt;
#[cfg(windows)]
use tokio::signal::windows::CtrlC as Interrupt;

use crate::picker::Picker;
use handler::Handler;

const TRANSPORT_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_CONNECTION_TASKS: usize = 8;

pub async fn run(picker: Picker, native: NativeSelection) -> anyhow::Result<()> {
    serve(Handler::new(picker, native)).await
}

async fn serve(handler: Handler) -> anyhow::Result<()> {
    let mut connections = JoinSet::new();
    let result = async {
        let listener = TcpListener::bind(crate::native_service::ADDRESS).await?;
        let mut interrupt = register_interrupt()?;
        publish_readiness(&mut io::stdout().lock(), listener.local_addr()?)?;
        run_connections(&listener, &handler, &mut connections, &mut interrupt).await
    }
    .await;
    let cleanup = stop_service(&mut connections, &handler).await;
    // Cleanup still runs on startup/publication/serving errors. Preserve the
    // shutdown failure if cleanup itself could not complete.
    cleanup.and(result)
}

// These constructors register immediately, before readiness is published.
#[cfg(unix)]
fn register_interrupt() -> io::Result<Interrupt> {
    use tokio::signal::unix::{SignalKind, signal};
    signal(SignalKind::interrupt())
}

#[cfg(windows)]
fn register_interrupt() -> io::Result<Interrupt> {
    tokio::signal::windows::ctrl_c()
}

fn publish_readiness(output: &mut dyn Write, address: SocketAddr) -> anyhow::Result<()> {
    writeln!(
        output,
        "{}",
        serde_json::json!({
            "endpoint": format!("ws://{address}"),
        })
    )?;
    output.flush()?;
    Ok(())
}

async fn run_connections(
    listener: &TcpListener,
    handler: &Handler,
    connections: &mut JoinSet<anyhow::Result<()>>,
    interrupt: &mut Interrupt,
) -> anyhow::Result<()> {
    loop {
        tokio::select! {
            accepted = listener.accept(), if connections.len() < MAX_CONNECTION_TASKS => {
                let (stream, _) = accepted?;
                connections.spawn(connection(stream, handler.clone()));
            }
            Some(completed) = connections.join_next() => {
                if let Err(error) = completed.context("Connection task failed").and_then(|result| result) {
                    eprintln!("{error:#}");
                }
            }
            _ = interrupt.recv() => break,
        }
    }
    Ok(())
}

async fn stop_service(
    connections: &mut JoinSet<anyhow::Result<()>>,
    handler: &Handler,
) -> anyhow::Result<()> {
    // Stop admitting requests before releasing the owner. Already running native
    // I/O cannot be interrupted; cleanup waits on its lock before dropping owner.
    connections.shutdown().await;
    handler.shutdown().await
}

async fn connection(stream: TcpStream, handler: Handler) -> anyhow::Result<()> {
    // 1. Service handshake deadline: bound the upgrade after TCP acceptance.
    // Release the connection and its task if the peer does not complete the upgrade.
    // The service cannot rely on clients to enforce their own connection deadlines.
    let (_, mut socket) = timeout(
        TRANSPORT_TIMEOUT,
        ServerBuilder::new()
            .limits(Limits::default().max_payload_len(Some(MAX_REQUEST_MESSAGE_BYTES)))
            .accept(stream),
    )
    .await
    .context("WebSocket handshake timed out")??;

    loop {
        // 2. Receive the next filesystem request; idle waiting has no deadline.
        let Some(request) = receive(&mut socket).await? else {
            return Ok(());
        };

        // 3. Dispatch the request without an application deadline.
        // Native-dialog waits and filesystem work are outside transport deadlines.
        let response = handler.dispatch(request).await?;

        // 4. Encode the reply, then bound sending and flushing it to the peer.
        // This deadline covers reply delivery after filesystem dispatch completes.
        let payload = encode_response(&response)?;
        timeout(TRANSPORT_TIMEOUT, socket.send(Message::binary(payload)))
            .await
            .context("WebSocket reply send timed out")??;
    }
}

async fn receive(socket: &mut WebSocketStream<TcpStream>) -> anyhow::Result<Option<Request>> {
    loop {
        let Some(message) = socket.next().await else {
            return Ok(None);
        };
        let message = match message {
            Ok(message) => message,
            Err(error) => {
                // The receive failure remains primary if flushing also fails.
                if let Err(flush_error) = timeout(TRANSPORT_TIMEOUT, socket.flush())
                    .await
                    .context("WebSocket flush timed out")
                    .and_then(|result| result.map_err(anyhow::Error::from))
                {
                    eprintln!("Failed to flush after a receive error: {flush_error:#}");
                }
                return Err(error.into());
            }
        };
        if message.is_close() {
            timeout(TRANSPORT_TIMEOUT, socket.flush())
                .await
                .context("WebSocket flush timed out")??;
            return Ok(None);
        }
        if message.is_ping() || message.is_pong() {
            timeout(TRANSPORT_TIMEOUT, socket.flush())
                .await
                .context("WebSocket flush timed out")??;
            continue;
        }
        let decoded = if message.is_binary() {
            decode_request(message.as_payload()).map_err(anyhow::Error::from)
        } else {
            Err(anyhow::anyhow!("Expected a binary filesystem request"))
        };
        match decoded {
            Ok(request) => return Ok(Some(request)),
            Err(error) => {
                // A failed close reply must not hide why this request was rejected.
                if let Err(close_error) = timeout(
                    TRANSPORT_TIMEOUT,
                    socket.send(Message::close(
                        Some(CloseCode::PROTOCOL_ERROR),
                        "Invalid filesystem request",
                    )),
                )
                .await
                .context("WebSocket protocol reply timed out")
                .and_then(|result| result.map_err(anyhow::Error::from))
                {
                    eprintln!("Failed to close after an invalid request: {close_error:#}");
                }
                return Err(error);
            }
        }
    }
}
