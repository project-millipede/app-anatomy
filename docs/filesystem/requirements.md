# Application filesystem and I/O requirements

**Filesystem acceptance requirements. Bounded native reads and directory navigation
are implemented; complete acquisition, reconstruction and metadata fidelity remain
unqualified.**

The accepted [Wasm analysis with native filesystem access](../architecture/wasm-analysis-with-native-filesystem.md)
decision selects native Rust acquisition and bounded reads for the Wasm analyzer.

## Problem and scope

An application is more than the bytes of its main executable. Its files, names,
links, metadata and resource relationships must survive acquisition, inspection,
staging and export. A readable directory tree does not establish faithful
preservation, correct rewriting, valid signatures or executable loading.

These acceptance requirements apply whether the implementation uses WASI
filesystem interfaces, a Rust filesystem library, archive-backed storage, native
files or another adapter. A native OS mount is optional. Its additional checks
apply only when that capability is offered. Choosing an interface does not prove
that its implementation meets these requirements.

This document owns filesystem fidelity, I/O behavior and their acceptance checks.
The [portability requirements](../portability/requirements.md) own environment and
tool independence; the [relocation design](../rebuilding/application-relocation-and-signing.md)
owns application relationships and transformation planning. The
[signing experiments](../signing/ad-hoc-experiments.md) own signature-specific
coverage. Use the [complete-workflow experiments](../portability/complete-workflow-experiments.md)
for their integrated execution record.

Candidate-specific findings belong in separate evaluations. The
[FSKit native-mount variant](fskit-native-mount.md) is one optional approach; it
does not select the portable storage implementation or change this contract.

## Rust controls application I/O

The reusable Rust implementation must own file-access decisions, path and metadata
interpretation, consistency, caching policy, rewriting and signing. Its storage
abstractions remain ordinary Rust interfaces. WIT, WASI and browser-specific
bindings belong in adapters, as established by the
[system architecture](../architecture/system-overview.md).

- Application processing must not require an entire executable or bundle to be
  loaded into a JavaScript buffer or Wasm byte vector before analysis begins.
  Rust requests bounded ranges and streams output. Moving a whole-file allocation
  from JavaScript into Rust does not satisfy this requirement.
- Keep small buffers and borrowed byte views where useful. An in-memory adapter
  remains appropriate for fixtures and callers that already hold bytes; it must
  not be the mandatory storage model.
- Preserve checked 64-bit file offsets and lengths throughout the adapters. Bound
  individual network reads, protocol messages, queued work and output buffering.
  State parser allocation and retention behavior explicitly. The
  [parser contract](../architecture/rust-analysis-core.md#reads-and-memory)
  documents the current analyzer's memory behavior.
- Hashing may require every covered byte, but must not require retaining all those
  bytes at once. Record a candidate library's full-input requirements before
  adoption; a streaming wrapper cannot remove a parser's internal allocation.
- Browser code provides required browser API access, permission interaction,
  component binding and UI lifecycle. Reusable client protocol, resource ownership,
  response validation and completion semantics belong in Rust, as required by
  [Rust runtime independence](../architecture/rust-runtime-independence/README.md).
  Browser adapters may enforce local safety bounds while fulfilling Rust requests.
  A Rust filesystem component may supply filesystem semantics inside Wasm, with
  only backing-storage access crossing the host boundary.
- Choose and test the synchronous or asynchronous I/O bridge explicitly. Component
  instantiation mode alone does not establish support for asynchronous reads during
  a Rust call. Qualify pending work and local disposal according to the source's
  actual capabilities. The application shows a pending state until analysis
  returns; disposing its local bindings cannot forcibly interrupt native I/O.
  Persistent native selection retains its source handles until successful
  replacement or owner/service shutdown.

The browser File API supports range selection through `Blob.slice()` and file
reading in workers. That provides access to bytes, not proof that the acquisition
path supplies all required application metadata.
[File API specification](https://www.w3.org/TR/FileAPI/).

The [current Rust API](../architecture/rust-analysis-core.md#adapter-and-ui) supports
bounded backing-storage reads through `ByteSource`. This implemented read path
does not establish all preservation, consistency or export requirements below.

## Preserve the application representation

### Complete acquisition and explicit unknowns

Account for every admitted directory entry, including hidden files, empty
directories, nested bundles and unknown file types. Keep an inventory connecting
each entry to its source, type, length, content digest when measured, link
relationships and required metadata. Unreadable entries and unavailable metadata
must remain visible as failures or unknowns; they must not disappear or acquire
invented source values.

An adapter cannot recover information its input never supplied. A browser-selected
file tree or archive must demonstrate its metadata coverage. If a required field
is missing, faithful reconstruction is unsupported until another source supplies
it. A metadata sidecar may carry values an intermediate store cannot represent,
but the final export or mount must restore them or report the remaining gap.

### Names, links and identity

- Preserve names without lossy conversion. Declare case sensitivity, case
  preservation and Unicode-equivalence behavior separately. Detect collisions
  before ingestion or export; never silently merge distinct entries.
- Preserve a symbolic link's target text and its identity as a link. Distinguish
  inspecting the link from following it. Handle relative, absolute, broken,
  cyclic and external targets explicitly. Reading a target and copying its bytes
  is not preservation of the link.
- Preserve hardlink relationships when present in the admitted input. Mounted
  aliases must identify the same object and report consistent link counts.
  Stable identity within a view is required; reproducing source inode numbers
  on a different volume is not. Persistence across remounts is a separate claim.
- Make directory enumeration, lookup and metadata agree. A returned name must be
  usable for lookup under the declared rules. No entries may be lost or duplicated
  across paginated enumeration of a stable directory.

For example, `Example.framework/Versions/Current -> A` must remain a link, and a
root-level `Example -> Versions/Current/Example` must resolve through that chain
in the resulting view. Links leaving the application require a declared external
relationship; preserving their text does not make their targets part of staging.

### Bytes and metadata

Unchanged files must retain their exact logical bytes and lengths. Record every
intended byte change, including changes made by signing and packaging. Preserve
file modes, extended-attribute names and values, and other metadata required by
the admitted case: ownership, ACLs, file flags and timestamps where applicable.
Any mapping to a different host representation must be explicit.

Storing metadata, exposing it through a view and enforcing its meaning are
different capabilities. Reporting an owner or permission mode does not prove
that access checks enforce it. Record mount options and backend limitations that
affect effective access. macOS distinguishes UNIX permissions, ACLs and sandbox
restrictions.
[Apple filesystem security](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html).

Preservation and signing preparation also have different purposes. Apple rejects
resource-fork and Finder-info extended attributes in signed application bundles.
Retain evidence of the original attributes and record deliberate output changes;
do not blindly retain or erase every xattr. Quarantine and other policy-related
attributes must not be silently removed to make a launch check pass.
[Apple QA1940](https://developer.apple.com/library/archive/qa/qa1940/_index.html).

## Consistent access and protected originals

Reads must honor arbitrary offsets, partial-read contracts, EOF and concurrent
requests. Distinguish a source I/O failure from malformed binary data. A failed
read must not become fabricated zero bytes or a successful truncated result.
Sparse regions, when supported, must return their correct logical contents.

Acquisition, inspection, planning and staging must share a recorded source version.
Use a stable snapshot or reliably detect source changes and restart or reject the
operation. Rewriting creates a declared output version; verification must inspect
that completed version. File size and modification time alone must not be treated
as proof that content remained unchanged. Readers must not combine old executable
bytes with newer signature data or resources.

Original contents and required metadata remain protected. Stage changes in an
isolated destination or overlay. Resolve links and traversal under the declared
access scope so that a write cannot accidentally affect the original application
or an unrelated path. Any permitted external access must be identified.

Preserving a tree does not redirect embedded dependency references. Establish
which known dependencies and resources resolve within the staged application,
through system locations or into the original installation using the
[relocation context](../rebuilding/application-relocation-and-signing.md#dependency-resolution-context).
Keep runtime-computed and otherwise unresolved relationships explicit.

## Writable output and export

These requirements apply wherever rewriting or export writes data, including
backends that expose only a read-only application view to consumers.

- Define create, truncate, replace, rename and delete behavior, including hardlink
  aliases and open handles. Make contents, directory entries and metadata coherent
  after each completed operation; invalidate affected caches.
- Complete rebuilding and signing in a staged version before publishing completed
  output. Atomic replacement of one file is not an atomic bundle transaction.
  A published signed version must not receive untracked content changes.
- Define what successful writes, synchronization and completion mean for the
  backend. An ephemeral store must say so; a persistent store must honor its
  declared durability contract. Never report successful synchronization after
  silently discarding pending data or metadata.
- Handle partial writes, exhausted storage, interrupted exports and backend failure.
  Incomplete results remain distinguishable from completed artifacts. Recovery and
  cleanup must preserve the original and any previously completed output.
- Reopen exported output through the intended input path and compare it with the
  declared final inventory. Required metadata carried internally must survive this
  last step. Repeat structural and signature checks after export when applicable.

## Additional requirements for a native mount

A mount must satisfy the shared requirements through the operating system's
filesystem interface, not only through direct calls to the Rust backend.

- Compare native directory enumeration, metadata, link operations and offset reads
  with the inventory. Test read-only `mmap` separately from ordinary reads.
- Keep object and backing-storage lifetimes valid while file handles or mappings
  remain active. Test replacement and cache behavior under concurrent access if
  writable access is supported.
- Test normal mounting, busy unmounts, forced unmount behavior, repeated cycles,
  backend termination and recovery. Never report a failed unmount as complete.
- Release descriptors, service connections, mount points and owned temporary
  resources according to the lifecycle contract. Cleanup must not remove sources
  or completed output. Pending reads and writes must finish or fail explicitly.
- Report actual capabilities and unsupported operations. Pin the OS, architecture,
  filesystem adapter and runtime versions for every compatibility claim.

## Acceptance evidence

Begin with an unchanged controlled application tree, then apply intended edits.
Compare a baseline inventory with the internal view, optional native mount and
reopened export. Required fidelity is established across these boundaries; hashing
ordinary files alone cannot establish name, metadata or link preservation.

Use small fixtures covering framework symlink chains, hardlinks, case and Unicode
collisions, xattrs, modes, empty entries and missing metadata. Add large-file range
reads, concurrent changes, interrupted writes and lifecycle failures. Measure read
ranges, peak memory and retained handles to establish bounded I/O and cleanup.
Return explicit unsupported outcomes for cases outside the admitted scope.

Keep the following evidence separate:

| Check                              | What a passing result establishes                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Inventory and round trip           | The declared bytes, entries, links and metadata survive the tested path.              |
| Offset reads and read-only mapping | Native access returns correct data on the tested mount.                               |
| Signature verification             | The selected signature units and resource seals validate under the recorded verifier. |
| Executable and library loading     | The tested executable, libraries and helpers load under the recorded environment.     |
| Application behavior               | The tested resources, plug-ins and workflows function after relocation.               |
| OS policy assessment               | The recorded policy accepts that artifact and launch context.                         |

Establish original verification results before attributing failures to the view.
Exercise applicable architecture slices and nested units using the signing plan's
fixtures and corruption controls. A negative control must be rejected for the
expected reason. Do not treat successful verification as proof of loading, or a
successful initial launch as coverage of every helper and runtime dependency.

macOS can independently reject launch or library loading because of signing
identity and embedded constraints. Faithful storage and a valid ad-hoc signature
cannot promise arbitrary application execution or retention of vendor authority.
[Apple launch and library constraints](https://developer.apple.com/documentation/security/applying-launch-environment-and-library-constraints).

Record **pass**, **fail**, **unsupported**, **not applicable** or **not run** for
each applicable requirement. Unsupported required behavior prevents a fidelity
claim for that case; an expected rejection proves error handling only. A route
without native mounting can satisfy storage and export requirements while marking
mount checks not applicable, provided it makes no mounting claim.

Use native Apple validation as optional independent evidence, without making it a
dependency of portable processing or of preparing the baseline fixtures. Record
the checks and environment in the existing
[complete-workflow result](../portability/complete-workflow-experiments.md#result-record-and-acceptance).
No backend or interface is qualified by this document alone.
