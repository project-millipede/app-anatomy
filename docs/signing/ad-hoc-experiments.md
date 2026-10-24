# Portable ad-hoc signing experiments

**Status: source screening updated 2026-09-17; execution experiments not run.
No signer has been adopted.**

This document applies the [shared portability requirements](../portability/requirements.md)
to signing and resource sealing. It owns the signing-specific artifact coverage
and checks used by [complete-workflow qualification](../portability/complete-workflow-experiments.md).

## Requirement and decision

Identify reusable libraries that can re-sign artifacts without Apple hardware,
macOS, Xcode, Apple's signing utilities or a remote Mac. The complete signing
path must run offline, including nested-code signing and resource sealing.
It must not require a certificate, private key, Apple account, keychain,
provisioning service or timestamp service for ad-hoc output.

The portability goal includes native applications and the browser. Test native
Linux and Windows first, then the Rust component through jco in a dedicated
browser signing harness. Its browser-only requirement is distinct from the
application's [native filesystem input](../filesystem/README.md).
Other devices and runtimes gain support only through recorded experiments.
A native library, a cross-compiled binary or a successful Wasm build alone does
not prove all these execution paths.

Here, **ad-hoc signing** means an identity-free code signature, not Apple's
certificate-and-provisioning-based Ad Hoc distribution workflow for iOS.
It cannot retain a vendor's authenticated identity or establish installation,
library-loading or execution permission. Treat those as separate evaluations.
[Apple provisioning model](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles),
[code-signing policy](https://developer.apple.com/library/archive/technotes/tn2206/_index.html).

The intended breadth is **every relevant signed artifact and nested signing unit**,
not only the main executable. Each format needs its own determination: supports
ad-hoc signing, requires a different signature scheme, unsupported by this
candidate, or not yet tested. Never infer universal coverage from a small corpus.

## 0. Screen documentation and implementation first

Before adding a dependency or scheduling the full artifact matrix, read the
candidate's README, versioned manifest, build configuration, CI targets and
implementation of the exact signing operation. Follow helper calls, feature
gates and transitive dependencies far enough to identify Apple-tool calls,
filesystem/process assumptions and browser build blockers.

Record the version or commit and source links, then make a separate decision for
native signing and browser use: eligible for a focused experiment, requires a
defined adaptation, or unsuitable for the requested operation. A platform claim
in a README is useful evidence, but does not override a conflicting code path.
A missing Wasm build is an evidence gap; an unconditional incompatible dependency
is a concrete blocker. C++ itself does not make Wasm impossible.

Our current browser build targets `wasm32-unknown-unknown` and generates jco
bindings with `wasiShim: false`. Filesystem-oriented native APIs therefore need
an explicit integration design; a generic WASI build would not prove compatibility
with this pipeline.
[Current build script](../../scripts/build-engine.ts).

The [screened options](../libraries/selection-and-reuse.md#portable-signing-candidates)
have different dispositions. Start with `apple-codesign` for native signing and
a narrowly scoped `libsui` ARM64 byte-signing feasibility check. The latter does
not establish mixed-architecture or bundle support.
No reviewed option yet establishes the complete native-and-browser requirement.

The separate [`macho` experiments](../libraries/bryanmatteson-macho-evaluation.md) evaluate
that toolkit's inspection, bounded rewriting and signing-provider integration.
Any signing profile admitted there must pass this document's shared qualification
procedure; a wrapper around `apple-codesign` does not establish independent
portability or artifact coverage.

## Shared evidence for admitted experiments

Run only the experiments admitted by that screening, independently for each
pinned version or revision. Resolve a known build or integration blocker before
investing in the full bundle/package matrix for that execution environment.
Prefer their existing parsers, signature writers and bundle-sealing mechanisms
over creating a new implementation. Missing functionality is a recorded gap,
not an instruction to build another signer.

Keep one shared fixture corpus and common assertions. Record separate results
per candidate, host, runtime and artifact so alternatives remain comparable.
The harness may call a library or a tool; record which route was tested.
A passing command-line tool is not yet a proven embeddable Rust API.
All experiments remain outside the product until an adoption decision.

## 1. Prove independence from Apple tooling

Build and run on clean non-Apple hosts with no Apple SDK, Apple signing binaries
or mounted Mac filesystem. Disable runtime network access and record subprocesses,
dynamic libraries and filesystem dependencies. Do not hide an Apple-tool
invocation behind a wrapper or service.

| Execution environment           | Required evidence                                                             |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Linux x86_64 and arm64          | Actual signing runs; distinguish native execution from emulation              |
| Windows                         | Actual signing runs; record architecture, filesystem and runtime dependencies |
| Browser worker through WIT/jco  | Local input to signed output with no server or subprocess                     |
| Additional devices / WASI hosts | Explicit runtime and resource limits; separate run before claiming support    |

Record build dependencies separately from runtime dependencies, including C/C++,
OpenSSL, filesystem assumptions and target-specific Rust features. Test an
ordinary native Rust caller as well as the component adapter where integration
is possible. Keep WIT/Wasm details outside reusable signing logic.

Fixtures must be usable without a Mac: retain redistributable inputs with
digests and provenance or generate them using portable tooling. Record any SDK
or Apple-host dependency in fixture creation separately. The mandatory baseline
must not require creating or refreshing fixtures on an Apple machine.

## 2. Re-sign individual code objects

For each applicable artifact below, test unsigned input, an existing ad-hoc
signature and a certificate-signed input being replaced with an ad-hoc signature.
Use controlled keys for generated certificate-signed fixtures; they are inputs
for replacement testing, not a requirement for producing ad-hoc output.
Include already-modified covered bytes, a missing signature command, insufficient
signature space and malformed signatures. Preserve original input digests.

| Artifact              | Coverage to establish                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| Thin Mach-O           | Executables, dylibs and loadable bundles; arm64 and x86_64 first                    |
| Universal Mach-O      | Every member; 32/64-bit fat tables, alignment and mixed signature states            |
| Other Mach-O variants | 32-bit images, byte order and CPU subtypes; explicit support or rejection           |
| Signature metadata    | Identifiers, flags, requirements, XML/DER entitlements and special-slot hashes      |
| Non-Mach-O code       | Scripts and detached/xattr signatures; identify storage and filesystem requirements |

Run re-signing once without unrelated edits, then after a controlled change to
covered content. Supply explicit signing policy rather than inheriting defaults.
Record retained, replaced and removed metadata, including old CMS identity data.
Check all CodeDirectories, member ranges, page hashes and relevant special slots.
Require an actual ad-hoc signature for every requested signing unit; a successful
API return or an existing signature command is insufficient.
Do not conflate fat-table entry width with Mach-O header width.

Unsupported inputs must fail explicitly without publishing partial output as a
successful result. Encrypted or otherwise restricted inputs need their own
classification; re-signing does not establish that they can be reconstructed or
executed.

## 3. Re-sign complete bundles and resources

Test a controlled macOS `.app` containing a versioned framework, dylib, helper,
XPC service, nested app, plug-in and resource-only bundle. Add flat iOS-style apps
and extensions, recording their declared platform separately from architecture.
Cover relevant watchOS/tvOS/visionOS layouts as separate cases before claiming
support. An XCFramework is an outer collection whose inner variants and any
outer signing unit must be evaluated independently.

Change one resource, one nested executable and bundle metadata in separate runs,
then combine changes. Verify the signer discovers all intended code, signs
children before parents and regenerates affected resource seals. Check symlinks,
framework versions, executable modes, case-sensitive names and paths that leave
the staged tree. Windows and browser adapters must preserve the required
semantics or report a limitation.

Compare every resource and signing unit against the input inventory. Reject silent
omission of helpers, extensions, architectures or files the signer cannot handle.
Do not count copying an old `CodeResources` file as successful resource sealing.
Treat byte changes, resource coverage and nested-code requirements separately.

## 4. Evaluate enclosing packages and signature schemes

| Container or signed object                  | Experiment boundary                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ZIP / IPA                                   | Extract, sign contained units, repack and verify layout/metadata; distinguish container from inner signatures              |
| DMG                                         | Test the image's signature separately from extracting, signing and rebuilding its filesystem contents                      |
| PKG / XAR                                   | Determine the container's signature scheme and whether identity-free output is meaningful; separately inspect payload code |
| Provisioning profiles and other CMS objects | Classify their own signature requirements; do not claim that re-signing an app recreates these authorities                 |
| Other platforms' packages and binaries      | Separate format-specific experiments; Apple ad-hoc semantics do not establish PE, APK or other signing support             |

For a format without an equivalent ad-hoc scheme, report **not applicable** with
evidence. A checksum, self-signed certificate and an Apple ad-hoc CodeDirectory
are different results. A library's container-signing support also does not prove
that it can unpack, rebuild and re-sign everything inside that container.

## 5. Establish browser and reusable Rust integration

After native correctness, attempt the same applicable cases through our component
and jco worker. Record build failures, unavailable APIs and dependency features;
do not replace the required local execution with a server fallback.

Supply bytes and an explicit artifact inventory through I/O adapters. Test whether
the candidate needs a filesystem and whether that can be supplied without changing
signing semantics. Keep candidate-specific types behind the integration boundary.
Reuse the ordinary Rust logic from a native consumer without requiring jco.

Measure build and download size, initialization, signing time, peak memory and
output size on representative bundles. Bounded header inspection is not evidence
of workable large-bundle signing. Unsupported device limits must
remain visible in the result.

## Independent checks and adoption gate

Use an independent portable parser/checker to validate final structure, code-page
hashes, applicable special slots, resource seals and nested units. A candidate
checking its own output is useful but insufficient. Add tamper controls: change
a signed page, sealed resource and nested unit after signing and require the
corresponding integrity check to fail. Record any unverified rules explicitly.

An optional Mac can run Apple's verification tools and controlled runtime checks
on the exact same output digests. Keep this evidence separate; neither signature
production nor portable integrity testing may require it. Claim compatibility
with a particular Apple OS only when those platform checks have actually run.
The [LIEF experiment](../libraries/lief-native-macho-rewriting-experiment.md) covers one such runtime
resolution case after rewriting.

Record exact versions, input/output digests, policy, commands or API calls,
environment, observed dependencies and results. Use **pass**, **fail**,
**unsupported**, **not applicable** or **not run** for each case; a documented
upstream capability remains unmeasured until exercised here.

Adopt a candidate only for the host/runtime and artifact combinations demonstrated
by these experiments. It must produce output without Apple tooling, pass the
independent integrity checks for that scope, preserve every intended artifact
and expose clear failure behavior. Native success cannot close an unresolved
browser requirement. Keep complementary libraries where their proven coverage
differs, while sharing our Rust contracts, fixtures and evidence.
