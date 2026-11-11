# Rust-to-WIT generator comparison

**Status: pinned inspection trials, 2026-11-11.**

This study compares Linera Witty, WITGenstein and Fidius for generating WIT and
component bindings from Rust definitions. It records the declarations, semantic
projections and forwarding that each adoption still requires.

Open [comparison.html](comparison.html) in a browser for the complete 57-row
table, preserving the reviewed wording and green/red background colors. The
standalone page works offline with its styles embedded.

The trials invoke the actual ordinary Rust `Session::inspect` operation across
five deterministic fixture scenarios. The comparison covers type reuse, resource
ownership, report and diagnostic representation, generated bindings, runtime
verification and maintenance measurements.

| Generator    | Pinned upstream source                                                                                         | Experiment report                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linera Witty | [`672d97bb2fce`](https://github.com/linera-io/linera-protocol/commit/672d97bb2fce3127db351069df72f1d225d8f263) | [`feature/wit-inspect-linera`](https://github.com/project-millipede/app-anatomy/blob/a37d477743b0d24fddc2369543b4296d26f63eec/crates/workbench/component/experiments/wit-inspect/README.md)      |
| WITGenstein  | [`f915331135cd`](https://github.com/tschneidereit/witgenstein/commit/f915331135cd409893890b9fea91cd8a69d2e864) | [`feature/wit-inspect-witgenstein`](https://github.com/project-millipede/app-anatomy/blob/f72ca500e0e8a1047859e4c67a4340b35ed8d322/crates/workbench/component/experiments/wit-inspect/README.md) |
| Fidius       | [`208b6010f946`](https://github.com/colliery-io/fidius/commit/208b6010f9466c06f54e4cc10d66fa9985f12029)        | [`feature/wit-inspect-fidius`](https://github.com/project-millipede/app-anatomy/blob/dffe296589a38373beb3fa75a2f4948fe21312d3/crates/workbench/component/experiments/wit-inspect/README.md)      |

The experiment reports are linked at their reviewed commits and include
reproduction commands and qualification limits. Findings apply to those pinned
revisions and the demonstrated inspection contract.
