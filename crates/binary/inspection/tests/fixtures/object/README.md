# Upstream object fixtures

`object_formats.rs` downloads unchanged fixtures from
[`gimli-rs/object-testfiles`](https://github.com/gimli-rs/object-testfiles/tree/fe8da208d4013ec3691311915fdc7d71436c0d1e).
Revision `fe8da208d4013ec3691311915fdc7d71436c0d1e` is the `testfiles` submodule
pinned by `object` 0.40.0 at commit `400e64fbcb03fddb4b1ae8aef1868976ab999acc`.

| Upstream path          |   Bytes | SHA-256                                                            |
| ---------------------- | ------: | ------------------------------------------------------------------ |
| `elf/base.o`           |   1,552 | `a361b3588b8b8cf1b1d9a47a48498b011ce5a72bd2a8170da417718c7d727b25` |
| `macho/base-aarch64.o` |     744 | `11927e782b4d644b8cf81ee7db3242a707e55f46ad5827b3e48e0dc6ef2fae90` |
| `pe/base-gnu.exe`      | 297,861 | `513001c978f9b1c492d11b0d3f3c0346f98acbe711072e4b910e1d97c9711102` |

The test-only `test-assets-ureq` dependency downloads and verifies these files
under `crates/binary/inspection/target/object-testfiles`, covered by the existing
`target/` Git exclusion. Only the fixture definitions are stored in Git.

Run `cargo test --locked -p binary-inspection` normally. The first run needs
network access to obtain missing fixtures; later runs verify and reuse cached
files. Tests read the files at runtime and never execute them. No fixture
download runs during an ordinary library or application build.

The existing resident/source comparison covers all three formats. The PE
fixture's COFF symbol table also lets the test source simulate an acquisition
failure without modifying the binary. A test-local `OnceLock` initializes the
shared fixture directory before either test reads it.

The upstream corpus does not declare a repository-wide license at this revision.
These source references record provenance; they do not assign the separate
`object` library's MIT/Apache license to these binaries.
