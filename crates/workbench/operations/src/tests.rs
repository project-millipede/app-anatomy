use super::*;
use filesystem_protocol::{
    MAX_REQUEST_BYTES, Request, Response, SelectedResource, SelectionState, decode_request,
    encode_response,
};
use std::{cell::RefCell, rc::Rc};

fn resource(byte: char) -> String {
    byte.to_string().repeat(64)
}
fn macho() -> Vec<u8> {
    [0xfeedfacfu32, 0x0100000c, 0, 2, 0, 0, 0, 0]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect()
}
fn selected() -> SelectionState {
    SelectionState {
        file: Some(SelectedResource {
            name: "file".into(),
            resource: resource('a'),
        }),
        ..SelectionState::default()
    }
}
#[derive(Default)]
struct Observed {
    requests: Vec<Request>,
}
struct FileTransport {
    observed: Rc<RefCell<Observed>>,
    bytes: Vec<u8>,
}
impl Transport for FileTransport {
    fn exchange(&mut self, bytes: Vec<u8>) -> Result<Vec<u8>, Failure> {
        let request = decode_request(&bytes).unwrap();
        let mut observed = self.observed.borrow_mut();
        observed.requests.push(request.clone());
        let response = match request {
            Request::CurrentSelection => Response::Selection(selected()),
            Request::ByteLength { .. } => Response::ByteLength(self.bytes.len() as u64),
            Request::ReadAt { offset, length, .. } => {
                let start = (offset as usize).min(self.bytes.len());
                let end = (start + length as usize).min(self.bytes.len());
                Response::Read(self.bytes[start..end].to_vec())
            }
            _ => panic!("unexpected request: {request:?}"),
        };
        encode_response(&response).map_err(Failure::protocol)
    }
    fn reset(&mut self) {}
}
fn file(bytes: Vec<u8>, observed: Rc<RefCell<Observed>>) -> Session {
    Session::new(Box::new(FileTransport { observed, bytes }))
}
#[test]
fn a_command_table_larger_than_one_remote_read_is_filled_in_chunks() {
    let command_size = MAX_REQUEST_BYTES + 8;
    let mut bytes = macho();
    bytes[16..20].copy_from_slice(&1_u32.to_le_bytes());
    bytes[20..24].copy_from_slice(&command_size.to_le_bytes());
    // One opaque command spans the protocol boundary; object requests it as one table.
    bytes.extend_from_slice(&0x1234_u32.to_le_bytes());
    bytes.extend_from_slice(&command_size.to_le_bytes());
    bytes.resize(32 + command_size as usize, 0);
    let expected = binary_inspection::inspect(&bytes).unwrap();
    let observed = Rc::new(RefCell::new(Observed::default()));
    let mut session = file(bytes, observed.clone());

    let outcome = session.inspect(&resource('a'));

    let [step] = outcome.steps.as_slice() else {
        panic!("expected one inspection step");
    };
    assert_eq!(step.result.as_ref().unwrap(), &expected);
    let command_reads: Vec<_> = observed
        .borrow()
        .requests
        .iter()
        .filter_map(|request| match request {
            Request::ReadAt { offset, length, .. } if *offset >= 32 => Some((*offset, *length)),
            _ => None,
        })
        .collect();
    assert_eq!(
        command_reads,
        [
            (32, MAX_REQUEST_BYTES),
            (32 + u64::from(MAX_REQUEST_BYTES), 8)
        ]
    );
}
