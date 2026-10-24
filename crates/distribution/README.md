# Distribution: packaging, integration and composition

This grouping directory has no Cargo manifest. Its three crates separate
build-time packaging, reusable native OS integration and installed executables.
The platform packaging recipes require qualification on each supported host;
installer creation and installation are separate from the checks below.

## Ownership and library reuse

- `crates/distribution/packaging` defines `packaging`, a build-machine tool.
  Its catalog selects the executable Cargo package and owns the upstream
  `cargo_packager::Config` directly.
- Packaging metadata and executable identity live in `Config` and `Binary`.
  `PackageFormat` and `PackageOutput` are used directly. The catalog adds only a
  selection name and Cargo package, which cargo-packager does not model.
- The macOS recipe calls `apple-codesign` and `embala-pkg` as Rust libraries.
  `PkgSpec`, `FileSpec` and `DirSpec` describe the installer payload directly.
  No `ditto`, `pkgbuild`, `codesign`, `rcodesign` or `xcrun` process is launched
  for macOS packaging or development signing.
- `crates/distribution/integration` defines `integration`, an
  ordinary Rust library with no external dependencies. It exposes the existing
  single-instance lock operation through `try_acquire_instance_lock`. Callers
  supply a stable path; the library has no application identity, service
  dependency, directory convention or event loop. Ownership uses a standard
  `File`; contention returns `None`, and other I/O errors remain errors.
- `crates/distribution/composition` defines `composition`.
  Its `src/bin/native-workbench.rs` builds the installed `native-workbench`
  executable. It selects the filesystem service and retains the integration
  library's lock in its per-user application-data directory until the service
  stops.
- macOS Dock visibility and the app icon remain bundle metadata owned by
  packaging. The integration library currently implements only instance locking;
  this separation does not add tray menus or other new OS capabilities.
- `crates/services/filesystem` defines the `filesystem-service` library used
  directly by composition. Its `run()` also serves the independent developer
  executable `filesystem-service`.
- `crates/filesystem/{data,native,protocol}` and `crates/binary/inspection` retain
  their current names and responsibilities.

Packaging selects a composition package and binary; Cargo links the selected
service and integration library into that executable. There is no dynamic service
loading or additional process between the composition and the service library.
Add another binary under `composition/src/bin` and a packaging catalog entry when
another composition is needed. The packaging tool itself is not installed.

The packaging crate pins cargo-packager to upstream commit
`549b01a2e23c32f8faa190f962f034d777255f33`, the unreleased
[ZIP 9 dependency update](https://github.com/crabnebula-dev/cargo-packager/pull/500).
Published 0.11.8 depends on yanked ZIP 0.6 releases and cannot resolve a new
lockfile. This pin also includes upstream's intervening dependency updates.
HTTPS support and platform certificates are enabled without the packager CLI.

## Building

Use the workspace lockfile for builds:

```sh
cargo check --locked -p integration -p composition -p packaging
cargo run --locked -p packaging -- --list
cargo run --locked -p packaging -- native-workbench
```

Build on each native host. Packaging explicitly selects the active Rust compiler's
host target. Successful outputs are isolated beneath
`dist/distribution/native-workbench/<host>/`; failed runs remove their packaging output.
Native executable build artifacts live under `target/distribution/native-workbench/`.
The `native-workbench` catalog entry selects the executable of the same name from
`composition`. Each platform uses `native-workbench` for the package and executable
name, and Native Workbench for the product title.

- macOS: `cargo-packager` creates the app bundle, `apple-codesign` applies an
  ad-hoc app signature, and `embala-pkg` writes an unsigned product-archive
  `.pkg` targeting `/Applications`. Its component has no bundle relocation
  entries. Only regular files and directories are supported; symlinks and special
  files fail packaging. File bytes, directory entries and Unix permission bits
  are preserved. Extended attributes, ACLs and hard-link identity are not
  preserved. Current bundle contents do not require those capabilities.
- Windows: current-user NSIS installer.
- Debian-based Linux: `.deb` with the dependency expression supplied by
  `dpkg-shlibdeps`, plus FileChooser portal packages. Build prerequisites include
  `dpkg-dev`, binutils and metadata for the executable's linked native libraries.

One package format is selected per host. The library's defaults would generate
additional formats on macOS and Linux. Native compilation still invokes Cargo
and rustc; the macOS packaging/signing stage works on their completed output
through Rust library calls. Other platform recipes retain their own tool
requirements. Developer ID signing, notarization, publication and installation
are not performed by packaging; packaging libraries may use build caches.

## Development signatures

Ad-hoc signing does not use a certificate. It seals the app's executable and
bundle resources, but supplies no trusted developer identity. A self-signed
certificate is a different mechanism and is not created by this recipe.

The XAR installer format cannot carry an ad-hoc signature, so the `.pkg` remains
unsigned. Packaging reports that notarization and stapling were skipped; no Apple
credentials or network calls are used for development signing. Gatekeeper may
still block browser-downloaded development packages.

The new package writer emits empty bundle upgrade, version-check and strict
identifier lists. Atomic bundle replacement, stale-file removal and upgrade
behavior remain unqualified. These policies must be qualified before release;
the development package does not claim equivalence to every `pkgbuild` policy.

## Website download (macOS development build)

The website serves the installer as a static download. Build the Apple silicon
package on macOS, then stage it before starting or building Next.js. Set
`INSTALLER_PKG` to the final installer path printed by packaging:

```sh
mkdir -p apps/web/public/installers
cp "$INSTALLER_PKG" apps/web/public/installers/native-workbench-0.1.0-macos-arm64.pkg
```

Include the staged file when deploying the website. The filename and download
link describe this version and architecture; update both when releasing another
package. Generated packages are ignored by Git.

The browser downloads the package. The user opens it in macOS Installer, launches
Native Workbench from Applications, then reloads the website. Repeat the launch
after a Mac restart. This development package is unsigned and not notarized;
URL activation and automatic startup are not provided.

The macOS app bundle appears in the Dock when launched from Applications; its
packaging configuration leaves `LSUIElement` unset. Launch the `.app` bundle to
use this behavior. After installing an update, fully quit the existing service
and launch it again: single-instance handling keeps the old process alive when
a second instance tries to start.

## Runtime sequence

The concrete composition resolves its per-user lock path and asks the
integration library to acquire it. It then calls the service's synchronous `run()`
entry point on the OS main thread while retaining the returned `File`. The service
owns its Tokio runtime. On macOS, rfd processes native events on main while
the service and Tokio run on rfd's worker; other platforms keep the service on
the calling thread. Tokio teardown completes before rfd stops native event
processing. Both finish before the lock is released, including during unwinding.
The stable file stays on disk; ownership belongs to the OS lock on its handle.

Only lock contention suppresses startup; other errors propagate. A duplicate
invocation does not establish readiness or forward arguments. The fixed loopback
address can still conflict across users or with the independent developer CLI.
Native selection remains owned by the existing service until its shutdown.

## Validation and remaining capabilities

No tests or test-only dependencies are added. Existing tests remain unchanged.
Run the existing service/component/web checks:

```sh
cargo fmt --all -- --check
cargo check --locked -p integration -p composition -p packaging
cargo test --locked -p filesystem-service -p filesystem-native -p filesystem-protocol
pnpm engine:build
cargo test --locked -p workbench-component --lib
pnpm test:web
pnpm typecheck
pnpm build
```

Qualify packaging, actual installs, picker operation, duplicate startup, process
crash/restart and browser connections on each desktop. Linux needs a graphical
D-Bus session with a FileChooser portal. The service currently handles
SIGINT/Ctrl-C; managed-service shutdown and OS logout are not qualified.

URL activation/forwarding, login startup, mobile installation, browser-hosted
installation and automatic updates are not implemented by this base version.
No Wasm runtime or JavaScript is required for integration, composition or
packaging. Instance locking requires a native filesystem and OS locking support;
this reorganization does not qualify browser Wasm or mobile execution.

References: [Rust reuse](../../docs/architecture/rust-runtime-independence/README.md),
[cargo-packager](https://docs.rs/cargo-packager/0.11.8/cargo_packager/),
[Rust file locks](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock),
[Debian dependency discovery](https://manpages.debian.org/bookworm/dpkg-dev/dpkg-shlibdeps.1.en.html).
