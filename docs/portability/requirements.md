# Portability requirements

**Project requirement, 2026-09-17. Complete-workflow qualification remains pending.**

The complete workflow, from original artifact to reworked output, must be portable,
including every library, tool invocation and indirect dependency.

This document owns the shared requirements. The
[dependency inventory](tool-and-host-dependencies.md) records implementations and
gaps; the [complete-workflow experiments](complete-workflow-experiments.md) define
how to qualify their composition.

## Scope

The requirement covers input acquisition, inspection, extraction, dependency
resolution, planning, staging, binary rewriting, container reconstruction, signing,
resource sealing, verification and export wherever the declared transformation
requires them. It applies to individual executables, application contents and
supported enclosing packages, including every selected architecture and nested unit.

Every required stage must work in the declared execution environment. Support is
specific to an operation, artifact scope, dependency configuration and environment.

## Execution and tools

- Qualify native Rust use on Linux and Windows and local browser execution through
  the Rust component and jco. Record architectures and runtime versions with the
  evidence; qualify additional environments separately.
- Processing must run offline without Apple hardware, Apple-only executables,
  frameworks or SDKs, a mounted Mac filesystem, or a remote processing service.
  Apply this rule to helpers, transitive dependencies and conditional fallbacks.
- Prefer reusable library APIs. A portable external tool may be evaluated for a
  native route, with all its dependencies declared. Browser execution must perform
  the required operations locally without relying on OS subprocesses.
- Building the selected implementation and preparing the repeatable fixture
  baseline must be possible without Apple-specific tooling. Record compilers,
  linkers, SDK requirements, component tools and dependency acquisition separately
  from processing-time dependencies. Setup downloads do not justify network access
  during artifact processing.
- Preserve the reusable Rust and adapter boundaries defined by the
  [existing architecture](../architecture/system-overview.md).

For ad-hoc output, use the signing settings and identity-free requirements defined
in the [signing qualification](../signing/ad-hoc-experiments.md#requirement-and-decision).
They apply as part of this wider workflow.

## Artifact integrity and failure behavior

Preserve the original input and declare the intended transformation before writing
output. Account for all required files, members, resources and signature units;
explain changes beyond the requested edit. Reinspect the final exported artifact,
including changes introduced by signing or packaging.

Adapters must preserve required paths, permissions, symlinks and other metadata,
or carry them explicitly in an artifact representation suitable for export. An
unsupported host representation must produce a clear limitation rather than
silently dropping information. The
[application design](../rebuilding/application-relocation-and-signing.md) owns resource
relationships and staging semantics.

A required operation must complete or return an explicit failure or unsupported
result. Missing tools, skipped signing, dropped members and incomplete extraction
must not yield a successful workflow result. Partial intermediates may be retained
as diagnostics but must remain distinguishable from completed output. Apply input,
decompression, work, memory and output limits across the assembled workflow.

## Qualification

A supported workflow requires recorded input-to-output execution, declared
dependencies and independent final-output checks. Another wrapper over the same
implementation is not an independent check. Source findings and successful builds
remain evidence for those stages only; unresolved stages prevent a claim of
complete-workflow support.
