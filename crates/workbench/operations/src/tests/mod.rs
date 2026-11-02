use crate::{Failure, Session, Transport};
use filesystem_protocol::{Request, Response, decode_request, encode_response};
use std::{cell::RefCell, collections::VecDeque, rc::Rc};

pub(super) fn resource() -> String {
    "a".repeat(64)
}

#[derive(Default)]
pub(super) struct Observed {
    pub(super) requests: Vec<Request>,
    pub(super) resets: usize,
}

struct Replies {
    replies: VecDeque<Result<Vec<u8>, Failure>>,
    observed: Rc<RefCell<Observed>>,
}

impl Transport for Replies {
    fn exchange(&mut self, bytes: Vec<u8>) -> Result<Vec<u8>, Failure> {
        let decoded_request = decode_request(&bytes).unwrap();
        self.observed.borrow_mut().requests.push(decoded_request);
        self.replies.pop_front().expect("unexpected exchange")
    }

    fn reset(&mut self) {
        self.observed.borrow_mut().resets += 1;
    }
}

pub(super) fn session(
    replies: impl IntoIterator<Item = Result<Vec<u8>, Failure>>,
) -> (Session, Rc<RefCell<Observed>>) {
    let observed = Rc::new(RefCell::new(Observed::default()));
    let transport = Replies {
        replies: replies.into_iter().collect(),
        observed: observed.clone(),
    };
    (Session::new(Box::new(transport)), observed)
}

pub(super) fn reply(response: Response) -> Result<Vec<u8>, Failure> {
    let encoded_response = encode_response(&response).unwrap();
    Ok(encoded_response)
}
