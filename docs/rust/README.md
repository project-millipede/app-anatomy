# Rust implementation conventions

This area explains how Rust language behavior and standard-library APIs shape
implementation choices in this repository. It applies across the core, clients,
services and platform adapters.

Each topic distinguishes what Rust requires from what the project chooses,
explains the reasons, and shows how the convention applies to concrete code.
Architecture and feature documents link to the relevant topic.

Read the implementation practices before designing or changing Rust code, then
consult the focused topics for the decisions involved. The
[shared development guidelines](../development/README.md) govern API simplicity,
workflow responsibilities, and the need for coordination machinery.

## Topics

- [Implementation practices](implementation-practices.md): ownership and borrowing,
  state modeling, narrow APIs, errors, execution order, resource lifetimes,
  synchronization, unsafe boundaries, dependencies, documentation, and validation.
- [Integer types and conversions](integer-types.md): memory sizes, file coordinates,
  fixed-width fields, local diagnostics and representation boundaries.
- [Operation structure](operation-structure.md): named operation results, explicit
  execution order, test verification, and ownership during expression cleanup.

Add a focused topic here when another Rust implementation convention needs its
own explanation. Keep its rationale and examples together in that topic.
