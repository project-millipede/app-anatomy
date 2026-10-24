# Native LIEF Mach-O rewriting experiment

**Status: proposed experiment, 2026-09-16; not run and not an implemented capability.** This plan adds no
dependency, native executor or frontend control. Its purpose is to establish
whether we can reuse LIEF for the difficult rewriting work before designing a
large subsystem around assumptions about its coverage.

The decision is specific: can the pinned native Rust interface rebuild our
supported Mach-O fixtures after dependency-path and rpath changes, preserve every
architecture, and produce outputs that can be signed and executed correctly?
A successful result would justify a small native adapter around LIEF. It would
not establish support for arbitrary applications or other operating systems.

The [application relocation and signing design](../rebuilding/application-relocation-and-signing.md)
owns the broader staging problem, resource relationships and operation order.
The [library composition and layout-growth design](../rebuilding/macho-layout-growth-and-signing.md)
explains why a longer dependency path can exceed a bounded writer's capacity,
how LIEF can supply reconstruction, and which writer-to-signer contracts need
qualification. This experiment owns the evidence for that proposed handoff.
The [LIEF integration study](lief-selective-builds-and-wasm.md)
owns selective builds, Rust bridge constraints and possible Wasm delivery.
The [portable signing experiments](../signing/ad-hoc-experiments.md) own signer
qualification without Apple hardware or tools. This macOS runtime experiment
provides optional compatibility evidence. Complete-workflow portability is
qualified by the [shared workflow experiments](../portability/complete-workflow-experiments.md).

## Boundary and reproducibility

Use standard LIEF 1.0.0 as the initial baseline, with the Rust crate, native
libraries and build settings pinned together. Record the Workbench commit,
Rust version, target triple, compiler/linker versions, SDK and macOS version.
Archive the fixture sources, build arguments and input digests with the result.

Keep the evaluation in a separate native development harness when implemented.
The [future native macOS adapter](../architecture/native-macos-adapter.md) remains
a design proposal without an implementation or Cargo package. The harness should
test a narrow operation without first introducing a public executor API or WIT
changes. Future plans and reports remain ordinary Rust data; LIEF objects remain
inside the native adapter.
The React app continues to use the portable core through jco.

LIEF's Rust bindings use a native C++ bridge. This experiment therefore evaluates
native reuse, independently of the portable `object` experiment and its Wasm
build checks. It does not propose putting LIEF into the browser component.
[LIEF Rust integration](https://lief.re/doc/stable/api/rust/index.html).

## Controlled fixture matrix

Build a small macOS executable that calls an exported function in our own dylib.
The function should return a known value, and the fixture should report the loaded
library's resolved path. Use an isolated temporary fixture tree. Existing
header-only test samples cannot establish that a rewritten program will execute.
For this baseline, use no Hardened Runtime/library-validation signing flags and
no entitlements. Record that policy explicitly; later policy-specific fixtures
must be evaluated separately.

| Fixture                                                        | Purpose                                             | Required outcome                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Thin arm64 executable and dylib                                | Native path changes and execution on a matching Mac | Preserve architecture and behavior; load the staged dylib                           |
| Thin x86_64 executable and dylib                               | A second architecture and layout                    | Static checks; execute only on a compatible host or with available Rosetta          |
| Universal executable and dylib with arm64 and x86_64 members   | Reconstruction of every member                      | Preserve and validate both members; never emit only the first parsed member         |
| Insufficient spare load-command space                          | Growth beyond an existing command slot              | Demonstrate actual command/layout growth and valid resulting references             |
| Unsupported fat64, unusual endianness and damaged-member cases | Explicit limits and incomplete parsing              | Refuse unsupported rewrites with a reason; do not publish partial output as success |

The ordinary universal fixture uses the 32-bit **container table** with 64-bit
arm64 and x86_64 Mach-O members. Container-entry width and member-header width
are separate properties. Record unsupported builds or runtime environments as
unavailable, rather than counting them as passing coverage.

The inspected LIEF 1.0.0 parser has the universal-format limitations described
[in the foundation comparison](selection-and-reuse.md#where-lief-is-useful). Check the original member inventory against the
parsed inventory before modifying anything. In particular, a successfully parsed
subset is insufficient for a whole-file rewrite.
[Pinned parser source](https://github.com/lief-project/LIEF/blob/1.0.0/src/MachO/Parser.cpp).

## Concrete path rewrite

Use a staged layout with explicit source-to-destination mappings:

```text
input/bin/probe
input/lib/libprobe.dylib

staged/bin/probe
staged/Frameworks/RelocatedProbe/libprobe.dylib
```

| Field in the executable  | Before                    | After                                  |
| ------------------------ | ------------------------- | -------------------------------------- |
| Dylib dependency command | `@rpath/libprobe.dylib`   | `@rpath/RelocatedProbe/libprobe.dylib` |
| `LC_RPATH`               | `@executable_path/../lib` | `@executable_path/../Frameworks`       |

Give the staged dylib a matching install name if that field is part of the
fixture's declared transformation. Record changes to the executable's dependency
command and the dylib's own `LC_ID_DYLIB` separately. Keep system dependencies
unchanged. Include both an existing-rpath replacement and a separate rpath-addition
case, so command growth is tested as well as string replacement.

LIEF documents Rust operations for changing a library name, adding an rpath and
writing the result, including longer replacement paths. These are the capabilities
to exercise through the pinned bindings. Verify the available API for rebuilding
the complete universal container; a thin-image write proves only that member's
output. Any missing Rust binding is an evaluation finding, not a reason to
silently fall back to Python or write a custom layout engine.
[Mach-O modification APIs](https://lief.re/doc/stable/formats/macho/index.html#rpath-and-library-path-modification).

## Procedure and independent checks

1. **Establish the baseline.** Compile the fixtures, record all architecture
   members, target platform/minimum OS, dependencies, rpaths, segment/section ranges
   and signing metadata.
   Run the original executable where supported and retain its result. Keep the
   original fixture files unchanged throughout the rewrite checks.
2. **Measure reconstruction alone.** Fully parse and rebuild an unmodified copy
   before applying transformations. Record byte differences and structural
   differences separately. A writer may normalize layout; require explained
   changes and preserved semantics rather than assuming byte-for-byte identity.
   Carry this control through the signing, verification and runtime checks below
   as well, to separate reconstruction failures from transformation failures.
3. **Apply one transformation at a time.** Test dependency replacement, rpath
   replacement, rpath addition and then their combination. Apply the declared
   changes to every intended member, write into staging and retain a pre-signing
   intermediate for comparison. Ensure the growth fixture actually exhausts its
   original spare command space; a longer string alone does not prove relocation.
4. **Inspect with independent tools.** Compare original and staged outputs with
   available Apple/LLVM tools such as `otool`, `lipo` and `llvm-objdump`. Record
   their versions and arguments. Check member counts, CPU types/subtypes, dependency
   commands, rpaths, bounds/alignment and relevant linkedit, binding and fixup
   information. State whether the fixtures exercise chained fixups, legacy
   binding/rebasing or both. Use LIEF's own checks as additional evidence. Our current
   header-only report cannot validate all these structures.
5. **Sign the final layouts explicitly.** Record the original signature state;
   remove or replace obsolete signatures after changing covered bytes. Use a
   portable candidate qualified for these fixtures by the
   [signing experiments](../signing/ad-hoc-experiments.md), signing each final
   executable/dylib and checking every architecture. Preserve before-signing and
   after-signing digests. Record entitlements and code-signing flags rather than
   silently inheriting library defaults. Apple's `codesign` may sign a separate
   control copy to isolate a rewriting failure from a signer failure. That control
   cannot substitute for a passing portable signer.
6. **Verify the signed files.** Retain the native signature-verification result
   for each output and repeat structural inspection on the final signed bytes,
   since signing also modifies the file. Compare with the portable integrity
   checks; native verification is additional evidence. Report structural checks, signature integrity
   and execution results separately. An ad-hoc signature does not recreate a vendor identity,
   notarization or distribution trust. These plain executable/dylib fixtures do
   not test recursive bundle signing or resource seals.
7. **Prove runtime resolution.** Launch only the controlled fixture with a
   recorded environment, without injected loader-path overrides. Assert its
   expected function result and that its library path lies inside this run's
   staging directory. Remove the staged dylib in a separate disposable copy and
   require the expected load failure; this detects accidental fallback to the
   original. Run each supported architecture explicitly and mark others untested.

The signing step follows completion of binary layout changes; LIEF's own Mach-O
modification guide also separates signature removal from subsequent re-signing.
For a focused comparison, run the same supported dependency/rpath operation with
Apple's or LLVM's install-name tool and compare the outcomes. A limitation of
that reference tool is a recorded result, not a replacement for checking LIEF's
output.
[LIEF layout modification](https://lief.re/doc/stable/tutorials/11_macho_modification.html),
[LLVM install-name tool](https://llvm.org/docs/CommandGuide/llvm-install-name-tool.html).

Apple documents code signing and subsystem policy as distinct concerns; retain
that distinction in the experiment's evidence.
[Apple code-signing guidance](https://developer.apple.com/library/archive/technotes/tn2206/_index.html).

## Results and adoption gate

Produce fixture sources, a repeatable native harness and a result document with
machine-readable evidence. The evidence should identify inputs and output
digests, toolchain versions, operation parameters, per-architecture changes,
independent inspection results, signing settings/results, runtime library paths
and unavailable coverage. Measure build cost, rewrite time, peak memory and output
size so native integration costs are visible.

Qualify this native baseline for the proven operations only when all required
fixture checks pass:

- Every expected member survives; unsupported or partially parsed inputs produce
  an explicit failure and no published successful result.
- Intended changes are present, other changes are explained, structural checks
  agree and the originals retain their digests.
- Signed outputs verify and each claimed executable architecture loads the
  staged dependency with the expected behavior. Static-only results remain
  distinct from runtime results.
- For this isolated native experiment, keep LIEF dependencies outside the core
  and component dependency graphs; keep LIEF types outside the reusable domain API.

If a case fails, keep its reproducer and record whether the gap is in parsing,
the Rust bindings, reconstruction, signing or runtime policy. Prefer an upstream
fix or a narrower supported operation before creating replacement machinery.
Do not infer arbitrary Mach-O support from a small successful fixture matrix.

After this Mach-O gate, a separate cross-format experiment can test an ELF
dependency/runpath change and a PE import-DLL change through the available Rust
bindings. Require Linux and Windows runtime checks respectively before claiming
execution support. LIEF's format breadth makes those useful follow-ups; it does
not provide evidence that Apple bundle handling, Windows signing or Android
package signing can share one implementation.
