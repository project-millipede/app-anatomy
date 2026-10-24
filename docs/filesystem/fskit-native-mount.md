# FSKit as an optional native mounting variant

**Source review and proposed experiment, 2026-09-17. Not adopted or execution-tested.**

## Role and boundaries

FSKit is one option for exposing an application view to native macOS consumers.
This evaluation considers Apple's framework through the third-party FSKitBridge
and fskit-rs projects. It does not select a general filesystem implementation,
require an OS mount, or select WASI for the browser route.

The [shared filesystem requirements](requirements.md) remain the acceptance
contract. Portable inspection, rebuilding and signing must work independently of
this optional adapter under the [portability requirements](../portability/requirements.md).
Keep filesystem semantics and application processing reusable in ordinary Rust;
isolate macOS integration from that core.

The source snapshots reviewed are:

- [fskit-rs](https://github.com/debox-network/fskit-rs/tree/4103aa2a76d4a078fc70b391df7db7e625d72ffc),
  commit `4103aa2a76d4a078fc70b391df7db7e625d72ffc`,
  [package version `0.2.0`](https://github.com/debox-network/fskit-rs/blob/4103aa2a76d4a078fc70b391df7db7e625d72ffc/Cargo.toml#L1-L7).
- [FSKitBridge](https://github.com/debox-network/FSKitBridge/tree/98f72bffbfc44fb9fb4d7efc827305c98601f88f),
  commit `98f72bffbfc44fb9fb4d7efc827305c98601f88f`.

These are reviewed source versions, not a qualified dependency combination.

## What the components provide

| Component                            | Responsibility                                                             |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Apple FSKit                          | Connects a userspace filesystem extension to macOS filesystem operations.  |
| FSKitBridge                          | Packages a Swift extension that forwards operations to a separate backend. |
| fskit-rs                             | Supplies the Rust trait, protocol, transport and mount/session helpers.    |
| Selected Rust storage implementation | Supplies the actual entries, bytes, metadata, links and mutation behavior. |

The proposed data path is:

```text
Finder / native tools / applications
                |
        macOS filesystem layer
                | FSKit / XPC
        FSKitBridge extension
                | localhost TCP / Protobuf
        fskit-rs in a native Rust process
                |
        Reusable Rust filesystem / application view
                |
        Original storage + staged changes
```

The host app packages and enables the extension; it is not the file-I/O relay.
The existing TCP protocol connects the extension to the native backend. A control
connection from our React application would be a separate design; this repository
pair does not establish browser-worker or jco integration.
[Bridge architecture](https://github.com/debox-network/FSKitBridge/blob/98f72bffbfc44fb9fb4d7efc827305c98601f88f/README.md#architecture).

The Rust trait offers directory lookup/enumeration, offset reads/writes, metadata,
links, xattrs and synchronization. Offering an operation does not implement its
storage behavior: the shipped basic example returns `ENOSYS` from its filesystem
methods. A real backend must be selected or supplied and qualified.
[Rust API](https://github.com/debox-network/fskit-rs/blob/4103aa2a76d4a078fc70b391df7db7e625d72ffc/src/lib.rs),
[example backend](https://github.com/debox-network/fskit-rs/blob/4103aa2a76d4a078fc70b391df7db7e625d72ffc/examples/basic_fs.rs).

## Host and tool dependencies

The declared minimum is macOS 15.4.
[Rust integration requirements](https://github.com/debox-network/fskit-rs/blob/4103aa2a76d4a078fc70b391df7db7e625d72ffc/README.md#L3-L12).
The extension must be installed and enabled. Custom bridge builds use Xcode and
signing identities; upstream also describes notarization for distribution. These are deployment requirements for
the native adapter, separate from signing application artifacts processed by our
portable engine.
[Bridge setup](https://github.com/debox-network/FSKitBridge/blob/98f72bffbfc44fb9fb4d7efc827305c98601f88f/README.md#how-to-use).

The reviewed fskit-rs implementation uses native tools:

- Mount/session helpers create and attach a raw disk image using `hdiutil`, invoke
  `mount -F`, and clean up with `umount -f` and `hdiutil detach`.
  [Mount implementation](https://github.com/debox-network/fskit-rs/blob/4103aa2a76d4a078fc70b391df7db7e625d72ffc/src/mounter.rs).
- Optional installation/activation helpers use utilities including `ditto`,
  `xattr`, `lsregister`, `pluginkit` and `codesign`. The inspected `codesign` call
  verifies the bridge bundle; it is not an implementation of artifact re-signing.
  Installation-side attribute handling must not become an implicit policy for
  application inputs.
  [Installer implementation](https://github.com/debox-network/fskit-rs/blob/4103aa2a76d4a078fc70b391df7db7e625d72ffc/src/installer.rs).

These observations describe this wrapper's implementation, not a claim that every
FSKit integration must invoke the same tools. It is a macOS mounting route, not
evidence of portable processing. Record its chosen configuration using the
[tool and host dependency inventory](../portability/tool-and-host-dependencies.md).

## Evidence against the shared requirements

### Names and filesystem capabilities

Apple's `FSFileName` carries names as bytes, including names that cannot be
represented as valid UTF-8 strings. FSKit also distinguishes case handling,
hardlinks and persistent identifiers in its capability declarations. These API
features support expressing the shared requirements; the backend must still
demonstrate the corresponding behavior.
[FSFileName](https://developer.apple.com/documentation/fskit/fsfilename),
[volume capabilities](https://developer.apple.com/documentation/fskit/fsvolume/supportedcapabilities).

### Metadata and ownership

The reviewed integration uses `noowners`. Ownership values can be reported, but
this does not establish enforcement of source UID/GID permissions. A case requiring
original ownership enforcement cannot be declared faithful on that evidence.
[Rust API ownership caveat](https://github.com/debox-network/fskit-rs/blob/4103aa2a76d4a078fc70b391df7db7e625d72ffc/src/lib.rs#L234-L237).
The bridge's test guidance disables ownership checks and makes hardlink and xattr
coverage depend on the backend.
[Bridge test configuration](https://github.com/debox-network/FSKitBridge/blob/98f72bffbfc44fb9fb4d7efc827305c98601f88f/README.md#tests).

### Synchronization and mapped-file lifetime

FSKit synchronization carries an expectation that pending I/O and metadata have
been sent to the backing resource. The selected Rust backend must honor that
contract and propagate failures through the bridge.
[FSKit synchronization](https://developer.apple.com/documentation/fskit/fsvolume/handler/synchronize%28flags%3Areplyhandler%3A%29).

FSKit documents a final close associated with released memory mappings. Successful
file browsing therefore does not establish that backing data can already be
released, or that executable mappings work. Qualify the actual adapter's lifetime
and cleanup behavior against the shared mount requirements.
[FSKit open/close lifecycle](https://developer.apple.com/documentation/fskit/fsvolume/opencloseoperations).

Apple's SDK interfaces evolve; record the SDK and macOS versions used alongside
these pinned bridge sources before testing. API documentation is evidence about
contracts, not proof that the reviewed wrapper implements every capability.

## Qualification still required

Apply the [shared acceptance checks](requirements.md#acceptance-evidence) without
duplicating their fixture definitions here. For this variant, retain evidence
across the native mount, extension, transport and Rust backend boundaries.

Start with a read-only view of a controlled unchanged application tree. Establish
byte, framework-link and metadata fidelity through native operations, then test
mapping and lifecycle behavior. Add writable overlays only after that baseline.
Exercise backend termination, open handles during unmount, synchronization failures
and cleanup of the helper's temporary disk image and device attachment.

Record native signature verification and executable/library/helper loading as
separate results. No application launch, executable mapping or signature-check
success has been established by this source review. A trait method, an example
mount command or filesystem-test instructions cannot establish those outcomes.

The current decision is to retain FSKitBridge/fskit-rs as a candidate for optional
native presentation of a Rust-managed view. The [native acquisition decision](README.md) does not require an OS mount.
Shared writable storage and FSKit integration remain open; no installation, mount
or qualification run accompanies this source review.
