//! Execute the same facade through ordinary Rust, without a component or JavaScript.

use wit_inspect_witgenstein::{Session, fixture::RESOURCE};

fn main() {
    let mut session = Session::new();
    let outcome = session.inspect(RESOURCE.to_owned());
    println!("{outcome:#?}");
}
