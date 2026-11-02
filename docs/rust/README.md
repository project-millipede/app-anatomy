# Rust implementation conventions

This area explains how Rust language behavior and standard-library APIs shape
implementation choices in this repository. It applies across the core, clients,
services and platform adapters.

Each topic distinguishes what Rust requires from what the project chooses,
explains the reasons, and shows how the convention applies to concrete code.
Architecture and feature documents link to the relevant topic.

## Topics

- [Integer types and conversions](integer-types.md): memory sizes, file coordinates,
  fixed-width fields, local diagnostics and representation boundaries.

Add a focused topic here when another Rust implementation convention needs its
own explanation. Keep its rationale and examples together in that topic.
