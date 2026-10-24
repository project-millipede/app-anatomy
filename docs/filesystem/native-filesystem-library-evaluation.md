# Native filesystem libraries and incremental analyzer input

**Native library source review, 2026-09-21, with current integration notes.** The
additional native-access candidates remain unadopted. The analyzer uses `object`
0.40.0 read primitives; complete metadata and performance qualification is pending.

App Anatomy needs reusable file access that can preserve application structure,
expose native filesystem facts and supply the analyzer with bounded input ranges.
Existing libraries should provide those primitives wherever their behavior fits;
the project should implement the composition, domain model and uncovered adapters.

This study evaluates Bytecode Alliance's **`cap-std` and `cap-fs-ext`**, offset
reads and platform metadata extensions. The implemented native reader uses ordinary
Rust filesystem APIs; these capability crates have not been adopted.
**`object::ReadRef`** is a separate analyzer integration topic. Cross-platform
ordinary file access does not establish complete metadata fidelity.

This document owns candidate-specific capabilities, source findings, limitations
and proposed experiments. The [filesystem requirements](requirements.md) own
acceptance criteria; the [access overview](README.md) owns the broader backend
comparison. The [general library study](../libraries/selection-and-reuse.md)
retains format parsing, bundle recognition, archives, rewriting and signing.

## Placement in the accepted architecture

The [accepted architecture](../architecture/wasm-analysis-with-native-filesystem.md)
keeps the complete analyzer in Rust compiled to Wasm. Native Rust owns selection,
native handles, requested reads and filesystem metadata. It does not interpret
Mach-O or become a second analyzer. Ordinary native Rust reuse of the same core
remains a requirement.

The implemented [communication flow](../architecture/rust-runtime-independence/filesystem-communication-flow.md)
composes the Rust analyzer and client with a native Rust service. The core's
bounded `ByteSource` interface separates the analyzer from file acquisition;
`NativeFileSource` also supports direct in-process Rust use.

The library options below address native operations and future metadata coverage.
They do not replace the selected message protocol, browser networking provider or
ordinary Rust analysis API. Requested bytes still enter Wasm memory; resource
identity does not lend a native slice. Installation and richer platform support
remain separate qualification work.

## Directory access and retained handles

| Candidate              | Function in the native provider                                         | Principal gap                    |
| ---------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `cap-std` 4.0.3        | Directory-scoped opens, enumeration, links, metadata and retained files | Incomplete native metadata model |
| `cap-fs-ext` 4.0.3     | Additional link, open, timestamp and identity controls                  | Platform-dependent coverage      |
| `cap-primitives` 4.0.3 | Lower-level handle-relative filesystem operations                       | Requires deliberate composition  |

The reviewed ecosystem supports Linux, macOS, FreeBSD and Windows. `Dir` represents
an opened directory capability; operations resolve relative to that capability.
`File` wraps an ordinary native file and permits access to underlying handles for
additional operations. Our native session can retain these objects behind opaque
application/file resources. That session protocol is project work, not an API
supplied by these crates.
[Platform support](https://github.com/bytecodealliance/cap-std/blob/main/cap-std/README.md),
[versioned directory implementation](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/cap-std/src/fs/dir.rs),
[file implementation](https://docs.rs/cap-std/4.0.3/src/cap_std/fs/file.rs.html).

Prefer `cap-std` for normal operations and use `cap-fs-ext` for required additions.
Reach for `cap-primitives` only where the higher-level API does not expose the
needed primitive. Its implementation already selects Unix and Windows facilities;
the project need not duplicate that entire portability layer.
[Extension API](https://docs.rs/cap-fs-ext/4.0.3/cap_fs_ext/),
[primitive exports](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/cap-primitives/src/fs/mod.rs),
[platform dependencies](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/cap-primitives/Cargo.toml).

The ordinary metadata interfaces do not supply a complete model for ACLs, xattrs,
macOS flags/resource forks, Windows security descriptors/named streams or volume
capabilities. Supplement them without flattening platform records into supposedly
equivalent fields.
[Metadata implementation](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/cap-primitives/src/fs/metadata.rs).

### Preserve links separately from following them

For a framework such as:

```text
Example.app/Contents/Frameworks/Example.framework/
├── Example -> Versions/Current/Example
└── Versions/
    ├── Current -> A
    └── A/Example
```

the inventory must retain the links and their exact target text alongside access
to the executable. The reviewed operations make useful distinctions:

| Operation                   | Relevant behavior                                        |
| --------------------------- | -------------------------------------------------------- |
| `symlink_metadata`          | Inspect the link itself                                  |
| `read_link`                 | Read target text, rejecting rooted targets               |
| `read_link_contents`        | Retain target text, including absolute and `../` targets |
| Follow a path through `Dir` | Confine resolution to the directory capability           |

Reading an external target's text grants no access to that target. This lets us
record external relationships without silently incorporating them into the
application. The link's own location must still resolve within the capability.
[Read-link implementation and tests](https://docs.rs/cap-primitives/4.0.3/src/cap_primitives/fs/read_link.rs.html).

Each opened `Dir` defines a boundary. A link that leaves a framework subdirectory
but remains inside the selected application needs testing against root-relative
resolution; a separately confined nested `Dir` is not automatically equivalent.
This is a design consequence of the capability model.
[Path resolution model](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/README.md).

For future reconstruction, non-Windows `symlink_contents` can preserve target
text without resolving it. Windows file-versus-directory link creation requires
separate handling. The generic extension helper inspects the target to choose
the link type, which can fail for dangling or inaccessible targets. Qualify the
explicit methods using preserved link information.
[Link creation](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/cap-std/src/fs/dir.rs),
[extension implementation](https://docs.rs/cap-fs-ext/4.0.3/src/cap_fs_ext/dir_ext.rs.html).

Use ordinary `Path`/`OsString` interfaces rather than the optional UTF-8-only
facade. The WIT and transport representation must also retain native names;
lossless acquisition is defeated if a later boundary converts them lossily.
[Directory-entry names](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/cap-std/src/fs/dir_entry.rs).

### Identity and version qualifications

`cap-fs-ext` provides convenient device, inode and link-count helpers, but its
Windows implementation notes a 128-bit ReFS identity gap in the `u64` inode model.
Some accessors use `expect()` when metadata lacks required open-handle fields.
Do not blindly apply them to partial directory-entry metadata; retain identity
width, provenance and unavailable outcomes.
[Identity implementation](https://raw.githubusercontent.com/bytecodealliance/cap-std/v4.0.3/cap-fs-ext/src/metadata_ext.rs).

Use **4.0.3 as the reviewed baseline**, not 4.0.2. An upstream trailing-slash and
symlink confinement defect was fixed in 4.0.3 and 3.4.6. Its regression cases are
relevant to this application's traversal experiments.
[Upstream advisory](https://github.com/bytecodealliance/cap-std/security/advisories/GHSA-hp8f-xmx4-4qrg).

Wasmtime provides a useful versioned reuse precedent, not a runtime selection.
Wasmtime 47.0.4 directly declares `cap-std` and `cap-fs-ext` 4.0.3. The inspected
development `main`, identifying itself as 50.0.0-dev, instead uses an internal
filesystem layer and retains `cap-primitives` under `public-cap-primitives`.
Thus the ecosystem has been used for native WASI provisioning; current Wasmtime
should not be described simply as a `cap-std` wrapper. Development links below
are observations at the review date and can change.
[47.0.4 WASI manifest](https://raw.githubusercontent.com/bytecodealliance/wasmtime/v47.0.4/crates/wasi/Cargo.toml),
[47.0.4 dependency versions](https://raw.githubusercontent.com/bytecodealliance/wasmtime/v47.0.4/Cargo.toml),
[development filesystem](https://raw.githubusercontent.com/bytecodealliance/wasmtime/main/crates/wasi/src/filesystem.rs),
[development manifest](https://raw.githubusercontent.com/bytecodealliance/wasmtime/main/crates/wasi/Cargo.toml).

## Offset reads and directory traversal

Retained native files already support reads into caller-sized buffers at explicit
offsets. On Unix, `FileExt::read_at` leaves the cursor unchanged; Windows
`FileExt::seek_read` updates it. Neither operation requires a whole-file read.
Consistently supply offsets and qualify concurrent operations and any mixing with
cursor-based I/O. `Dir::read()` is a whole-file convenience, not the proposed
analysis path.
[Unix reads](https://doc.rust-lang.org/std/os/unix/fs/trait.FileExt.html#tymethod.read_at),
[Windows reads](https://doc.rust-lang.org/std/os/windows/fs/trait.FileExt.html#tymethod.seek_read).

| Candidate                 | Reuse opportunity                                                            | Qualification                                          |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| `system-interface` 0.27.3 | Common offset, exact and vectored reads across Unix-like systems and Windows | Published `cap-std` integration targets 3.x            |
| `positioned-io` 0.3.5     | `ReadAt`, bounded windows and cursor adapters                                | Windows wrapper still uses `seek_read`                 |
| `walkdir` 2.5.0           | Recursive traversal, ordering, errors and open-handle limits                 | Path-based traversal does not inherit a `Dir` boundary |

`system-interface::FileIoExt` is designed for ordinary files and the cap-std
ecosystem. It can save implementation of combinations such as exact vectored
offset reads. Verify interoperability with the proposed 4.x foundation before
selection; a trait implemented for a 3.x type does not automatically apply to its
4.x counterpart. Windows cursor/concurrency behavior and whether vectored reads
are efficient on the tested backend also need qualification.
[README](https://raw.githubusercontent.com/bytecodealliance/system-interface/main/README.md),
[API](https://docs.rs/system-interface/0.27.3/system_interface/fs/trait.FileIoExt.html),
[published dependency versions](https://docs.rs/crate/system-interface/0.27.3).

`positioned-io::RandomAccessFile` can wrap an already-opened `std::fs::File`.
Its implementation uses Unix `read_at` and Windows `seek_read`; on Windows it
records the original cursor and restores it when `try_into_inner` is called.
Do not infer identical cursor behavior from the common `ReadAt` trait or treat
the author's performance statements as project measurements. The Linux-specific
random-access hint is also not applied identically on every Unix platform.
[Wrapper source](https://docs.rs/positioned-io/0.3.5/src/positioned_io/raf.rs.html).

`walkdir` remains a useful traversal baseline and existing candidate. It reports
entry errors rather than requiring traversal to stop. Our inventory must retain
those errors instead of dropping them with a convenience iterator filter.
Ordinary link following defaults off, while root-link following defaults on and
has its own control. Its open-descriptor limit has a Windows exception when
following links. Compare it with traversal through `cap-std::Dir`; do not reopen
unconfined paths merely to combine the APIs.
[Traversal contract](https://docs.rs/walkdir/2.5.0/walkdir/struct.WalkDir.html).

## Native metadata libraries and binding gaps

| Candidate reviewed                      | Native coverage                         | Useful operations                               |
| --------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| `xattr` 1.6.1                           | macOS, Linux and supported Unix systems | Attribute names and byte values                 |
| `exacl` 0.13.0                          | macOS, Linux, FreeBSD                   | Extended or POSIX ACL operations                |
| `rustix` 1.1.5                          | Unix-like filesystem APIs               | Safe descriptors and extended status operations |
| `libc` 0.2.189 Darwin bindings          | macOS                                   | Attribute, bulk enumeration and volume queries  |
| `windows-sys` 0.61.2 / `windows` 0.62.2 | Windows                                 | Official OS API bindings                        |

These native APIs do not inherently require subprocess calls to platform command
line tools. Nevertheless, native libraries, OS facilities and installation remain
dependencies to record in the [dependency inventory](../portability/tool-and-host-dependencies.md).
The table is not a claim of identical coverage on every supported filesystem.

### Extended attributes with xattr

`xattr` supplies path operations and `FileExt` methods for opened files. Path
arguments retain native string forms; ordinary `get`/`list` inspect the link
itself, while `_deref` operations follow it. This is a strong reuse candidate for
macOS/Linux metadata acquisition.

There is no Windows implementation. Enumeration can omit privileged/system
attributes, so successful listing does not establish complete capture. Public
getters allocate complete attribute values; large-value limits require explicit
treatment, including for metadata carrying substantial data.
[Versioned API](https://docs.rs/xattr/1.6.1/xattr/),
[source and enumeration caveat](https://docs.rs/xattr/1.6.1/src/xattr/lib.rs.html),
[platform dispatch](https://docs.rs/xattr/1.6.1/src/xattr/sys/mod.rs.html).

### ACL reuse with exacl

`exacl` offers one higher-level API across macOS extended ACLs, Linux POSIX
access/default ACLs and FreeBSD ACL support. Its optional serialization support
can help reporting. The released interface is path-based, follows links by
default and offers symlink ACL handling on macOS rather than uniformly on Linux.
Linux builds link native `libacl`; Windows is outside its scope.
[API](https://docs.rs/exacl/0.13.0/exacl/),
[released implementation](https://github.com/byllyfish/exacl/blob/v0.13.0/src/lib.rs),
[build integration](https://github.com/byllyfish/exacl/blob/v0.13.0/build.rs).

Preservation needs original principal identifiers, ACL ordering and platform
provenance. **Released 0.13.0 resolves principals through names and does not expose
the newer `NATIVE_ID` option.** Inspected upstream master adds that option despite
its manifest still declaring 0.13.0. Do not attribute unreleased behavior to the
published crate. Qualify an appropriate version or narrowly scoped adapter before
relying on the library for faithful acquisition; also address path reopening
relative to the retained source handle.
[Released options](https://github.com/byllyfish/exacl/blob/v0.13.0/src/acl.rs),
[released principal conversion](https://github.com/byllyfish/exacl/blob/v0.13.0/src/qualifier.rs),
[development options](https://github.com/byllyfish/exacl/blob/master/src/acl.rs).

### Unix descriptor and Linux extensions with rustix

`rustix` provides I/O-safe descriptors and operations including `openat`, `statat`,
`readlinkat`, filesystem status and platform-specific xattr facilities. Linux
`statx` provides extended metadata with masks indicating available fields.
Retain masks and errors, including unavailable system-call support.

These filesystem APIs do not provide Windows support, automatic directory
confinement or the complete project metadata model. Use them as targeted native
primitives, often already beneath the cap-std layer.
[Scope](https://github.com/bytecodealliance/rustix/blob/main/README.md),
[versioned API](https://docs.rs/rustix/1.1.5/rustix/),
[statx contract](https://docs.rs/rustix/1.1.5/rustix/fs/fn.statx.html).

### Darwin metadata and bulk enumeration

The `libc` Darwin bindings expose `fgetattrlist`, `getattrlistat` and
`getattrlistbulk`. A narrow native adapter can query richer entry information and
volume capability/attribute masks. Raw bindings leave buffer decoding, bounds and
returned-field validation to the adapter.
[Darwin bindings](https://docs.rs/libc/0.2.189/x86_64-apple-darwin/libc/),
[bulk-call signature](https://docs.rs/libc/0.2.189/x86_64-apple-darwin/libc/fn.getattrlistbulk.html).

Bulk enumeration can reduce per-entry metadata calls; it is a candidate
optimization, not a measured improvement. The bulk call does not accept volume
attribute requests. Use the appropriate separate attribute query and preserve
both capability and validity masks. Requested entry attributes are not necessarily
returned, so inspect the returned-attribute mask.
[Apple attribute contract](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/getattrlist.2.html),
[bulk API](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man2/getattrlistbulk.2),
[attribute definitions](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/attr.h).

### Windows metadata through official bindings

`windows-sys` exposes raw APIs; `windows` supplies typed projections. Both are
official Microsoft binding foundations, not complete safe preservation layers.
Microsoft's current project guidance distinguishes convenient application-wide
crates from focused/private bindings for reusable libraries. Select the required
surface without leaking binding types into the analysis core.
[Project guidance](https://github.com/microsoft/windows-rs),
[raw binding scope](https://github.com/microsoft/windows-rs/blob/master/docs/crates/windows-sys.md).

Relevant operations include:

- `GetFileInformationByHandleEx` for retained-handle information and appropriate
  file identifier classes, including 128-bit identities.
- `GetSecurityInfo` for owners and security descriptors. SACL access requires
  additional rights/privilege; denied access is not an absent ACL.
- `FSCTL_GET_REPARSE_POINT` for reparse data, and stream enumeration for named data
  streams. NT extended attributes are a separate subject from alternate streams.
- `GetVolumeInformationByHandleW` for filesystem feature flags, retaining errors
  and documented remote-volume limitations.

[Handle information](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandleex),
[security descriptors](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo),
[reparse data](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_get_reparse_point),
[streams](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirststreamw),
[volume capabilities](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationbyhandlew).

Capability evidence depends on the actual volume, driver, permissions and entry.
Keep **absent**, **unsupported**, **denied** and **not inspected** distinct.
Reading a field does not establish that an export can restore or enforce it.
The [overview](README.md#filesystem-type-driver-and-source-representation) owns
the APFS/NTFS, mounted-directory, offline-image and archive distinctions; these
native access libraries are not automatically filesystem-image parsers.

## Incremental reading inside the analyzer

`object` 0.40.0 provides `ReadRef`, which supports both already-resident bytes and
reading regions from storage on demand. Its documentation explicitly identifies
Wasm as a use case for the latter. Mach-O readers use this abstraction. The current core adapts it through
`ByteSource` and validates ranges in its `ReadCache` integration.
[ReadRef](https://docs.rs/object/0.40.0/object/read/trait.ReadRef.html),
[Mach-O reader](https://docs.rs/object/0.40.0/object/read/macho/struct.MachOFile.html).

The Wasm analyzer requests a container header, selects architecture members and
reads load commands. Reading additional referenced tables is future analysis work.
The native provider supplies requested ranges; interpretation stays in Wasm.
Hashing may still need every covered byte, processed in bounded portions.

The supplied `ReadCache` is reused by the analyzer. Its `clear` operation requires
exclusive access, so cached bytes must remain available while parsers borrow them. The
[parser contract](../architecture/rust-analysis-core.md#reads-and-memory) defines
the current memory behavior and upstream allocation-diagnostic limitations.
[ReadCache](https://docs.rs/object/0.40.0/object/read/struct.ReadCache.html).

Further qualification must cover memory use, borrowed-data lifetimes, range
validation and diagnostics on representative artifacts. `ReadRef` methods return `Result<_, ()>`; the adapter
must retain underlying source I/O failures separately from malformed-binary errors.
`ReadRef` is synchronous: connecting it to asynchronous imported operations needs
deliberate integration. The current component uses JSPI; neither a native
async runtime nor jco's async instantiation setting supplies that by itself.
Borrowed parser slices refer to bytes already in the analyzer's memory, not the
native provider's buffers. The [architecture decision](../architecture/wasm-analysis-with-native-filesystem.md#remaining-qualification)
owns the bridge choices; the [format study](../libraries/selection-and-reuse.md#why-object-is-the-first-candidate)
owns parser coverage and limitations.

## Optional I/O execution and memory optimizations

These candidates address how the native provider schedules or serves reads.
They do not replace directory authority, metadata coverage or the host bridge.

| Candidate                | Potential benefit                                       | Reason to evaluate separately                                |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| Tokio filesystem support | Integrate reads into an existing Tokio host             | Ordinary file I/O currently uses a blocking pool             |
| Compio                   | Completion-based runtime and positional file operations | Runtime integration and platform behavior need measurement   |
| `memmap2` 0.9.11         | Native file mapping where appropriate                   | Source mutation hazards; no browser-Wasm zero-copy guarantee |

Tokio's filesystem documentation explains that ordinary blocking operations are
currently performed through `spawn_blocking`. An async API does not imply kernel
asynchronous file I/O on every platform. Avoid whole-file convenience operations
when implementing the bounded range contract. There is no reason to select a
runtime solely because it exposes an async file API.
[Tokio filesystem behavior](https://docs.rs/tokio/latest/tokio/fs/index.html).

Compio's reviewed 0.19.x documentation describes a thread-per-core runtime using
IOCP, io_uring and polling, and a file API with explicit offsets rather than an
internal cursor. Its low-level driver can also be used separately from its
executor. Qualify platform-specific filesystem execution and the actual host
integration before claiming a performance benefit; its whole-file README example
is not our proposed read pattern.
[Compio README](https://github.com/compio-rs/compio),
[file API](https://docs.rs/compio/latest/compio/fs/struct.File.html).

`memmap2` marks file-backed mappings unsafe because modification of the backing
file can lead to undefined behavior. It needs an appropriate source-consistency
strategy, not merely a read-only handle. A native mapping does not become a guest
memory mapping through a WIT resource and does not eliminate delivery of requested
bytes into browser Wasm.
[Mapping safety contract](https://docs.rs/memmap2/0.9.11/memmap2/struct.MmapOptions.html).

Both browser ranges and native ranges can avoid mandatory whole-file input.
Compare end-to-end latency, requests, transferred bytes and memory, including
native transport overhead. Metadata batches and retained handles are measurable
optimization opportunities, not proof that native access is always faster.

## Other reviewed candidates and specific exclusions

These findings prevent rediscovering attractive but incomplete abstractions.
They are not additional adopted dependencies.

- **`vfs` / rust-vfs:** useful for interchangeable storage, overlays and fixtures,
  but the reviewed filesystem trait uses UTF-8 paths and string directory names.
  It cannot be the sole faithful native-name representation without a separate
  lossless model. [Trait source](https://raw.githubusercontent.com/manuel-woelker/rust-vfs/master/src/filesystem.rs).
- **`jwalk`:** archived on 2026-08-05 and marked unmaintained. Upstream points to
  `dua-core`; that suggestion is not qualification of a replacement for this
  project. Keep `walkdir` as the reviewed traversal baseline.
  [Repository status](https://github.com/Byron/jwalk).
- **`getattrlistbulk` 0.1.0:** the wrapper exposes a `String` name and explicitly
  performs lossy UTF-8 conversion. Reject it unchanged for faithful acquisition.
  The underlying Darwin API remains useful through an adapter preserving names.
  [Directory-entry contract](https://docs.rs/getattrlistbulk/0.1.0/getattrlistbulk/struct.DirEntry.html).
- **`file-id` 0.2.3:** offers a useful Unix/Windows identity model, but the released
  path helper follows links and reopens by path; Windows can fall back from
  higher-resolution identity queries. Prefer identity acquired from the retained
  source handle and preserve its quality. Development no-follow helpers must not
  be attributed to the release. [Released API and source](https://docs.rs/file-id/0.2.3/file_id/).
- **`same-file` 1.0.6:** useful for equality checks and retained handles, but the
  Windows implementation documents incomplete 128-bit ReFS identity handling.
  It is not a complete fidelity identity model.
  [Windows source](https://github.com/BurntSushi/same-file/blob/1.0.6/src/win.rs).
- **`posix-acl` 1.2.0:** a numeric-qualifier ACL alternative whose documentation
  reports testing only on Linux. It does not replace macOS extended ACL or Windows
  security descriptor support. [API](https://docs.rs/posix-acl/1.2.0/posix_acl/).
- **`whichdisk` 0.6.0:** an optional volume-resolution and identity candidate for
  macOS, Linux and Windows. Its filesystem type/case information does not replace
  a per-operation capability report; some behavior is inferred from filesystem
  type. Maturity and identity guarantees remain unqualified.
  [Project documentation](https://docs.rs/whichdisk/0.6.0/whichdisk/).

Retained handles and file identifiers do not establish an immutable snapshot.
Identifiers may be reused, and contents can change while the object remains open.
Apply the existing [source consistency contract](requirements.md#consistent-access-and-protected-originals).
Likewise, FSKit is an [optional mount adapter](fskit-native-mount.md), not a
prerequisite for reading an already accessible native application directory.

## Proposed experiments and selection order

Use the implemented ordinary-filesystem reader and bounded `object` integration
as the baseline. The `cap-std`/`cap-fs-ext` experiments below are conditional
candidates if their authority model fits a concrete requirement; they are not a
mandated replacement. Add platform metadata adapters for demonstrated gaps. Evaluate extra I/O abstractions and runtimes when they remove a concrete
implementation burden or improve a measured workload.

1. **Directory scope and representation.** Use a controlled framework tree with
   relative, absolute, external, broken and cyclic links. Include a link leaving
   an immediate subdirectory while remaining inside the application. Compare
   root-relative and nested-handle resolution, exact target text, native names and
   explicit traversal errors. Include hidden/empty entries and hardlink aliases.
2. **Retained-handle reads.** Exercise arbitrary offsets, short reads, EOF and
   concurrent requests on macOS, Linux and Windows. Compare standard/cap-std reads
   with proposed extensions. Establish Windows cursor behavior and prevent mixing
   incompatible access styles. Record request and allocation limits.
3. **Metadata coverage.** Evaluate xattrs, ACLs, native identity and volume queries
   against known fixtures. Preserve raw identifiers, validity masks and denied or
   unsupported outcomes. Compare Darwin bulk queries with individual queries while
   checking names and links. Include published-version dependency/build requirements.
4. **Incremental analyzer integration.** Connect the same analyzer to native and
   browser providers. Verify that the analyzer chooses ranges, native code supplies
   filesystem facts only, and range checks remain enforced for malformed input.
   Measure cache growth with overlapping and large requested
   ranges. Qualify synchronous parser access across the chosen async bridge.
5. **Consistency, lifecycle and measured cost.** Change source files during reads,
   dispose local bindings and stop the service. Check stale resources, cleanup and
   native ownership independently of presentation changes. Measure peak memory, copies, metadata calls, read counts,
   transferred bytes and elapsed time, including bridge overhead. Compare optional
   batching, runtime or mapping optimizations only against this baseline.
6. **Preservation beyond acquisition.** When writable staging/export is added,
   reopen the result and apply the shared round-trip requirements. Read support
   alone must not become a claim of faithful reconstruction, valid signing or
   executable loading.

Use the [shared acceptance evidence](requirements.md#acceptance-evidence) and
[complete-workflow result record](../portability/complete-workflow-experiments.md#result-record-and-acceptance)
instead of inventing a second qualification format. Record exact crate versions,
OS/architecture, filesystem/driver, permissions and native dependencies. A source
review establishes an API candidate; successful experiments establish only the
tested capabilities and environments.
