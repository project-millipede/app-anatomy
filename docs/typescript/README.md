# TypeScript implementation guidance

This area covers TypeScript language and platform practices for presentation,
UI lifecycle, required environment bindings, and repository build tooling.
Reusable analysis, filesystem protocol, and non-UI workflow semantics remain
owned by ordinary Rust APIs.

Read the implementation practices before designing or changing TypeScript code.
They distinguish runtime behavior from compiler checks and explain how general
practices apply within the repository's architecture. Check the owning package's
configuration rather than assuming identical compiler or runtime settings.

## Topics

- [Implementation practices](implementation-practices.md): strict typing, boundary
  validation, state modeling, mutation, functions and modules, promise ownership,
  failure handling, resource cleanup, and React lifecycle.

## Related authorities

- [Development guidelines](../development/README.md): shared design discipline,
  API simplicity, workflow responsibilities, and coordination requirements.
- [Rust reuse across execution environments](../architecture/rust-runtime-independence/README.md):
  the permitted roles of TypeScript and environment bindings.
- [System overview](../architecture/system-overview.md): application runtime,
  model, and presentation ownership.
- [Error-handling guidance](../architecture/error-handling.md) and
  [testing policy](../architecture/testing-policy.md): failure contracts and
  meaningful validation.

Keep focused language guidance here; keep feature contracts with their owners.
These documents do not authorize unrelated compiler migrations or cleanup.
