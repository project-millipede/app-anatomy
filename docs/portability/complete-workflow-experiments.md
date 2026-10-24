# Complete-workflow portability experiments

**Proposed qualification plan, 2026-09-17; not run.**

Establish that a selected composition satisfies the
[portability requirements](requirements.md) from original input to exported output.
This document owns integration evidence. The
[dependency inventory](tool-and-host-dependencies.md) owns tool and host findings;
existing stage experiments retain their detailed fixtures and assertions.

## Reuse the existing experiments

Reuse fixture definitions from the existing plans. Create and version each admitted
case once, retaining its identifier, provenance, input digest and expected facts.

| Existing plan                                                                                           | Additional question for the complete workflow                                                      |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Bounded rewriting](../libraries/bryanmatteson-macho-evaluation.md#4-test-bounded-rewriting-separately) | Does the real planned edit survive staging, subsequent signing and export?                         |
| [LIEF reconstruction](../libraries/lief-native-macho-rewriting-experiment.md#concrete-path-rewrite)     | Can the selected environment perform required layout growth and pass its output to the next stage? |
| [Signing and artifact coverage](../signing/ad-hoc-experiments.md)                                       | Can the actual rebuilt files and resources become independently verified final output?             |

Begin with one controlled executable and dependency. Expand to universal images,
nested application contents and enclosing packages using the linked coverage.
The [composition example](../rebuilding/macho-layout-growth-and-signing.md)
owns the explanation of layout growth and writer-to-signer compatibility.

Apply this group's requirements to environment preparation and tool independence.
Record unavailable coverage before attempting a larger corpus.

## Run procedure

1. **Declare the case.** Record selected members, intended changes, output format,
   signing settings, expected invariants and resource limits. Link the admitted
   fixture and exact dependency-inventory configuration used by every stage.
2. **Prepare the environment.** Reproduce the selected build on the declared
   system and retain its configuration. Make only declared processing tools and
   dependencies available. Disable processing-time network access and record how
   subprocesses, loaded libraries and host I/O will be observed. Capture the
   monitoring coverage and known blind spots.
3. **Run the actual composition.** Execute the declared transformation from input
   to export through the reusable Rust path for native cases and the component/jco
   harness for browser-only cases. The application's native-service input path is a
   separate deployment case and does not satisfy browser-only execution. Do not
   substitute an isolated CLI result for either
   integration.
4. **Capture the handoffs.** Keep input/output digests, diagnostics and member
   inventories at boundaries that change bytes or metadata, especially before
   signing and after export. Correlate observed tool calls and dependencies with
   the inventory. Investigate undeclared facilities and record their effect on
   the portability result.
5. **Check the exported artifact.** Reopen it through the intended input adapter.
   Apply the relevant independent structural, dependency, signature and resource
   checks from the stage plans to these final bytes and entries. Compare the
   resulting inventory and metadata with the declared transformation. Confirm the
   original's bytes and required metadata are unchanged.
6. **Repeat across environments.** Use equivalent inputs and operation settings
   in the required native and browser runs. Compare normalized facts and preserved
   contents. Explain output-byte differences caused by a writer, signer or archive
   builder; byte equality alone is not the general acceptance rule.

## Controls that exercise the composition

- Carry an unchanged round trip through the same adapters and export path to
  distinguish reconstruction effects from the requested modification.
- Exercise both fitting and space-exhausting path edits from the writer fixtures.
  Account for every member when their layout requirements differ.
- Remove a declared external dependency or make a host facility unavailable in a
  controlled run. Exercise relevant architecture/feature fallback branches and
  require an explicit failure when required work cannot finish.
- Feed malformed input and apply the linked corruption controls to final output.
  Require checks to identify the failed invariant. A successful self-parse alone
  is insufficient.
- Exercise interrupted/failed writes and configured resource limits. Preserve
  originals and ensure incomplete staging or exports cannot be reported as success.

## Result record and acceptance

Retain one run record linking the declared case, exact dependency-inventory snapshot,
build/environment record, observed traces, intermediate and final digests, check
results, diagnostics and resource measurements. For application trees, include
entry metadata and relationships as well as file hashes. Store detailed evidence
once and reference it from the relevant records.

Record **pass**, **fail**, **unsupported**, **not applicable** or **not run** per
required stage and control. Mark source findings as source evidence rather than
executed results. Explicitly list stages outside the declared case.

Apply the [shared qualification rule](requirements.md#qualification) to the complete
record. Successful expected-rejection controls prove error handling, not support
for transforming the rejected input.
