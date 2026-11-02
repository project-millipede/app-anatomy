# Integer types and conversions

Choose an integer type by what its value represents. A single Rust layer can use
`usize`, `u64` and `u32`: resident memory, logical file coordinates and a
schema-defined field have different responsibilities.

## Rust behavior

### `usize` follows the target's pointer width

Rust's memory APIs use `usize`. `Vec::len()` and slice lengths return `usize`;
slice indexes and `Vec::try_reserve_exact()` use `usize`. A read into a caller-owned
buffer returns a `usize` count of the bytes initialized in that buffer.

`usize` is 32 bits on `wasm32` and 64 bits on the project's current 64-bit native
targets. Using `u64` for every memory size would require conversions back to
`usize` at these operations. A representable `usize` size does not guarantee that
an allocation can succeed.

### `u64` and `u32` have fixed value ranges

`u64` is a 64-bit unsigned integer and `u32` is a 32-bit unsigned integer on both
native and Wasm targets. Their value ranges do not depend on the process's
address width. The type alone does not determine whether the value describes a
file position, a byte count, an identifier or a binary-format field.

A fixed-width Rust value domain does not imply a fixed number of encoded bytes.
For example, MessagePack does not always encode a `u32` value in four bytes.

## Project choices

These conventions guide new and revised code. Keep the domain meaning visible
when choosing types across layers.

| Quantity                                          | Type                                                 | Reason and examples                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Resident memory sizes and indexes                 | `usize`                                              | Matches Rust memory APIs: buffer/string lengths, slice indexes, allocation sizes and read counts        |
| Logical file lengths, absolute offsets and ranges | `u64`                                                | Keeps the same file coordinates across native and Wasm execution                                        |
| Explicit wire, WIT or binary-format fields        | The fixed-width type defined by the schema or format | Preserves the declared value domain; examples include `u32` directory identifiers and Mach-O flags      |
| Local budgets measuring memory                    | `usize`                                              | Allows direct comparison with buffer/string lengths, including allocation and message-byte limits       |
| Local diagnostic evidence                         | The type of the measured value                       | Memory counts can remain `usize`; original file offsets and request lengths retain their original types |

**Why `u64` for file coordinates:** a file can be larger than the process's
address space while inspection reads it through small buffers. `u64` keeps those
coordinates independent of local address width. It does not imply that the entire
file fits in one allocation or that every platform can access every representable
offset.

**Why `usize` for local memory-count diagnostics:** it records sizes already
returned by memory APIs without converting them solely to construct an error.
This is a project design choice, not a Rust requirement for every error field.
These diagnostics are ordinary Rust values, not serialized protocol fields.
For example, `RangeOverflow` retains its original `u64` offset and `u32` requested
length because those values describe the failed input.

### Conversions and validation

Convert where a representation changes. Use `From` for guaranteed conversions,
such as `u32` to `u64`, and `TryFrom` with explicit `match` when a value may not fit.
Avoid numeric `as` casts and panicking conversions for these sizes.

A successful conversion proves representability. Range arithmetic, allocation
failure, message budgets and response-versus-request bounds remain separate
checks at their responsible owner. Put each validation rule in one authoritative
implementation; invoke it where an independent boundary needs validation.

Handle conversion failure according to the operation's contract. Do not establish
a general rule to truncate or saturate values. The filesystem example below
allows a representable prefix because reads explicitly support partial progress.

## Filesystem example

The ordinary Rust source API combines `u64` file lengths and offsets with
caller-owned byte slices and `usize` read counts. The shared filesystem messages
preserve those file coordinates in `ReadAt.offset` and `Response::ByteLength`.
The service uses `usize` when allocating a response buffer and the source cursor
uses the actual returned count when completing a logical range.

**Why `u32` for `ReadAt.length`:** the existing protocol schema chooses it for the
requested byte count of one exchange. It can represent zero through `u32::MAX`
bytes independently of the platform's `usize` width. Larger logical reads can
continue across multiple exchanges. This is a protocol representation choice,
not a Rust, operating-system or WebSocket requirement. Changing the field's width
would be a separate shared-API and schema decision.

The requested length does not require a response of that size. The service's
read-response budget and the protocol's complete-message budget are separate
`usize` values because both bound resident byte buffers. Neither changes the
protocol field's value range. See the [service bounds](../../crates/services/filesystem/README.md#bounds-and-lifecycle)
for their current values.

When a caller buffer exceeds `u32::MAX`, the remote source can request a
representable prefix. The provider can return a smaller successful response,
and the source cursor continues from the actual byte count. This follows the
read contract's partial-progress semantics.

See the [filesystem communication flow](../architecture/rust-runtime-independence/filesystem-communication-flow.md)
for the owners of the request, response, transport and completion behavior.
