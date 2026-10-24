# Future native macOS adapter

Proposed for macOS filesystem metadata and optional Security.framework verification.
No implementation or Cargo package is present yet. This layer will consume the
ordinary `binary-inspection` library; native APIs must not leak into that portable crate.
Portable staging and ad-hoc signing must remain usable without this adapter; see
the [signing experiments](../signing/ad-hoc-experiments.md).

See the [application relocation and signing design](../rebuilding/application-relocation-and-signing.md)
for the proposed product workflow and the [native LIEF experiment](../libraries/lief-native-macho-rewriting-experiment.md)
for its separate, unrun feasibility procedure. Neither document implements this adapter.
