# Rust-to-WIT generator comparison

**Status: pinned inspection trials, 2026-11-11; direct-generation requirements
clarified 2026-11-12.**

This study compares Linera Witty, WITGenstein and Fidius for generating WIT and
component bindings directly from the types and operations already used by the
ordinary Rust implementation. The goal is to eliminate handwritten application
WIT, separately maintained wire DTOs and the adapters that translate between
those DTOs and the implementation types.

Open [comparison.html](comparison.html) in a browser for the historical 57-row
trial table, preserving the reviewed wording and green/red background colors.
The standalone page works offline with its styles embedded. Its DTO-based
partial adoptions are interoperability evidence; they do not meet the
direct-generation acceptance criteria below. The table is preserved unchanged.

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

## Required generation model

**The existing implementation's Rust types are the authoritative definitions.**
The selected operation is `Session::inspect`, including its Session resource,
factory and complete reachable report/error contract. Annotations and build
configuration select exports and representations without introducing another
handwritten data model.

```text
Existing Rust operations and types + declarative generation metadata
    -> Generated application WIT and required boundary adaptation
    -> wit-bindgen bindings, with compatible Rust type mappings
    -> jco / TypeScript bindings
```

Normal adoption may declare exported names, interface/world placement, concrete
generic instantiations and representation rules. Those declarations must refer
to the existing Rust definitions. Repeating their fields in a DTO, a mirror
model or configuration that reconstructs the schema fails the goal.

Generated binding types or ABI-specific layouts are output artifacts, not a
second maintained source. Required structural conversion and mechanical
forwarding must also be generated. The candidate and the standard binding tools
may share this work; each contribution must be attributed separately. Build
wiring and type mappings are allowed, but handwritten field-copy functions or
Guest delegation bodies remain gaps against complete adapter generation.

The scope is the application-owned inspection contract. Published external WIT
dependencies remain pinned inputs. Selection operations, UI, Archer, Polymorph
adapters and transport implementation remain outside the experiment. Ordinary
Rust APIs, validated constructors, rich error causes and Rust-only execution
remain intact; generation metadata must not make the default Rust build depend
on component tooling.

## Acceptance criteria and evaluation order

1. **Direct type reuse:** consume the implementation's actual records, enums,
   aliases and concrete `Outcome` / `StepOutcome` instantiations across their
   owning crates. No handwritten wire DTO graph or structural conversion layer.
2. **Complete WIT generation:** generate the selected resource, factory, method,
   argument and reachable data/error types, including nested results, options
   and lists. No handwritten application WIT fragments or edited generated WIT.
3. **Representation and contract preservation:** declarative rules must drive the
   generated schema and adaptation for genuine representation differences.
   Preserve names, interface identities, ownership, complete report information
   and ordered typed diagnostics. JSON/blob substitution, flattened errors or
   changed resource ownership cannot substitute for support.
4. **Change propagation:** changing a compatible exported field in its owning
   Rust definition must update WIT and bindings without editing WIT, a DTO field
   or a field-copy adapter. A representation-policy change may require changing
   its explicit rule; unchanged fields must propagate automatically.
5. **End-to-end evidence:** validate generated WIT and bindings, invoke the real
   Rust operation, and compare complete results through the existing native and
   jco scenarios. A schema-only or compile-only success qualifies that stage.

Removing handwritten WIT is a primary benefit, even if generated output is large.
Generating it from a new handwritten DTO still fails direct type reuse. Source
line counts are supplementary accounting; they cannot establish compliance with
these criteria.

## Schema-focused reevaluation

The same pinned revisions were rechecked with focused schema fixtures under Rust
1.95.0. Checks distinguish Rust compilation, successful generation, independent
WIT parsing and preservation of the requested types. A successful generator exit
or WIT parse alone can conceal a changed field or error type. These schema checks
add to the earlier real-operation evidence; they qualify no additional component
or browser execution.

The colored table preserves the original concrete-model trials. Some differences
in those trials were choices of declarations, rather than generator requirements.
In particular, WITGenstein and Fidius escape the field name `result` correctly.
Witty's package, interface and world names are configurable.

| Priority                                 | Linera Witty                                                                                                                                                                    | WITGenstein                                                                                                                                                           | Fidius                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing generic outcome structure       | Explicit `witty_specialize_with` substitutions compile the existing carrier shape with concrete payload fixtures. Unconstrained owner derives still need binding/layout bounds. | User generic arguments are lost. An actual `Outcome<Step>` fixture emitted `steps: list<string>` with a warning.                                                      | User type parameters are unresolved. `Outcome<Step>` fails on `Step`; `StepOutcome` fails on `Kind`.                                                                                                 |
| Aliases and distinct instantiations      | Rust aliases use the underlying type metadata. Two generic instantiations derived the same WIT name; registration kept only the first record.                                   | Aliases can produce undeclared WIT references. Distinct instantiations collapse to one discovered type; external dependency types are not resolved.                   | Source collection does not resolve aliases, reexports or dependency types. User generic arguments are not substituted.                                                                               |
| Nested results and field names           | Built-in `Result` works, but bare `result` and `resource` names produce invalid WIT. A field naming attribute did not change this output.                                       | Nested built-in containers and escaped `%result`/`%resource` generated valid, faithful WIT.                                                                           | Nested `Result` fields fail. Method-return `Result<T, E>` emits the framework `plugin-error` instead of the declared `E`. Keywords are escaped correctly.                                            |
| Session API and factory                  | The inspected interface/export machinery has no general Session resource model and rejects ordinary exported `self` receivers.                                                  | Constructor and borrowed-resource fixtures work. A free factory returning Session, directly or boxed, emits conflicting record/resource definitions.                  | Normal methods produce flat functions; the normal plugin macro rejects `&mut self`. Stream resources and configured plugin instances exist, but do not supply our Session resource/factory contract. |
| Reuse and change propagation             | Derives use owner definitions, subject to reachable field traits. Specialization markers avoid copying a generic declaration, but do not solve our complete boundary graph.     | Local concrete field changes propagate. Current-crate discovery and missing alias/generic resolution block the actual external ordinary graph.                        | Marked concrete owner records can drive WIT and field changes directly. Ordinary feature-gated `cfg_attr(..., derive(WitType))` markers are not recognized by source discovery.                      |
| Contract control and operation selection | Package, interface, world and type names are configurable. The inspected writers emit local type registries without our cross-interface type-use partition.                     | Package override works. Interface/world names are crate-derived; marking an impl collects all inherent methods of that type. Naming annotation arguments are ignored. | Package/version/world follow fixed conventions. Unit Rust enums emit WIT variants. Metadata and Serde renames do not configure WIT names.                                                            |
| Failure detection                        | Rust trait checks catch missing bounds, but generated WIT still needs independent validation and checks for duplicate type names.                                               | `--strict` permits invalid or type-losing output in these probes; the generation path does not enforce that option.                                                   | Many unsupported field types return errors, but accepted top-level results still need an assertion that the error type was preserved.                                                                |

The Witty generic checks used the ordinary carrier source shape with reduced
report/error payload fixtures. Explicit specialization produced the expected
nested structure; keeping its original `result` field failed WIT validation.
Renaming that field was a diagnostic control. A separate generic fixture needed
explicit associated-layout bounds before demonstrating the name collision.
These results qualify the generic mechanism, rather than complete generation of
the production inspection contract.

WITGenstein's 16 fixtures all compiled as ordinary Rust. Two generated documents
were syntactically valid while losing generic payload types. Free-factory
failures occurred during WIT generation/validation, before the separately known
Guest-wrapper failure. The earlier constructor-resource trial therefore supports
a narrower conclusion than the complete Session contract.

Fidius's 24 schema fixtures distinguish its plain `fidius-wit` API from its
plugin runtime and generated converters. Schema generation alone can use marked
concrete records, standard containers, private primitive fields, and some
lifetime/const-generic declarations whose fields are already concrete. Those
successes do not establish substitution of user type parameters or compilation
of the corresponding generated Guest. Its unchanged ordinary operation signature
and five native inspection scenarios were also checked.

## Maintained-code assessment

The current component already generates its Rust wire records from handwritten
WIT. Its inspection graph contains 26 reachable WIT types, including 17 records
with 44 fields. The experiments each introduce 17 handwritten Rust boundary
records with those 44 fields to drive schema generation. They remove handwritten
WIT for those trial models, but retain an authored wire model and its conversion
from ordinary Rust results. That is the extra layer this requirement excludes.

The relevant maintenance question is whether the existing Rust owner is the only
place to edit a compatible exported field. The historical DTO rename exercises
changed the DTO and its projector; they did not demonstrate propagation from the
implementation's owning type. Generating more code does not resolve that gap.

The existing `with` mappings operate after WIT exists. They route compatible
binding references to ordinary Rust records and enums. This is a wit-bindgen
capability, independent of which tool writes the WIT. It can avoid rebuilding
compatible values, but it does not infer a schema, repair a generator's lost
generic arguments, select semantic projections or supply resource forwarding.
It is a downstream binding mechanism, not a solution for authoring WIT from Rust.
In wit-bindgen 0.60, individual type mappings also do not suppress every generated
exported record declaration; generated field types and derives can impose
additional trait requirements.

A separate compile check used the unchanged production WIT and aliases of the
actual `Outcome`/`StepOutcome` carriers with generated report/diagnostic payloads.
The unchanged carriers failed because the generated outcome record's `Clone`
derive requires `StepOutcome: Clone`. Adding `#[derive(Clone)]` to `StepOutcome`
in a temporary source copy made both native and `wasm32-unknown-unknown` checks
pass; `Outcome` needed no change. The generated `GuestSession::inspect` return
type was checked against that alias. This qualifies the mapping and its trait
requirement, not operation forwarding or a component runtime round trip. The
temporary owner edit was restored; no production Rust change was made.

Because this check consumed handwritten production WIT and supplied no generated
forwarding, it is a binding-compatibility control, not a direct-generation pass.

Fidius's generated conversions connect its author model to its generated binding
model. They do not generate our ordinary-analysis-to-author-model projection.
The original Fidius trial also copied and converted four owner enums that the
production inspection bindings already reuse directly. Generated code for that
extra layer must not be counted as removal of existing application work.

In the inspected workflows, none of the three supplies a declarative mapping
that generates our numeric identity/name, formatted-version or ordered
error-diagnostic projection. These meanings cannot be inferred from Rust field
shapes alone. The required solution expresses them as rules against the existing
Rust types and generates both the wire representation and the adaptation.
Handwriting a projection DTO or converter is not an accepted workaround, even
when some fields genuinely change representation. A generator that cannot
express these rules has an unresolved capability gap.

Schema-only use has fewer obligations than a complete binding workflow. A new
Witty fixture generated valid WIT for a private primitive range using only
`WitType` and the public `WitInterfaceWriter`, with a manually declared empty
interface. Adding `wit_import` for that return type failed without `WitLoad`.
Thus loading is a requirement of that import workflow, not of schema generation
itself. This does not qualify direct private-field access through our component
bindings or replace the validated range constructor.

## Suitability for this adapter

**None of the pinned candidates has demonstrated the required direct-generation
workflow for the complete inspection contract.** The DTO-based round trips remain
valid partial interoperability results. They do not become compliant adoptions
because their generated WIT or bindings work. The following strengths identify
capabilities to investigate; they do not establish an adoption winner or the
engineering cost of closing the gaps.

**Witty has the strongest demonstrated generic-specialization mechanism of the
three.** Direct adoption still needs derived-bound handling, keyword escaping,
distinct instance names and an API strategy. Specializing the real generic owner
with the fixture's component projection types would also reverse the dependency
direction: the ordinary operations crate cannot depend on its component consumer.
The successful fixture placed its carrier and projected payload definitions
together. It demonstrates specialization, not direct generation from the actual
type graph without an authored projection model.

**WITGenstein remains useful for local concrete schemas and constructor-based
resources.** Faithful use of our existing aliases and generic types requires
alias/dependency resolution and generic substitution. Production adoption also
needs correct factory handling, deliberate method selection and contract naming.
Its local concrete DTO workaround does not satisfy direct type reuse.

**Fidius fits a marked concrete plugin model.** Its additional Guest/converter
automation does not close the nested-result, alias, generic-substitution or
general Session resource gaps. Preserving our wire contract also requires enum
and namespace controls. Generating conversions between authored DTOs and binding
types does not generate the adaptation from the implementation's actual types.

None of the pinned generators currently produces both our exact ordinary generic
graph and the Session factory contract as shipped. Retaining handwritten
resource/factory WIT or manual DTO adapters can help isolate a limitation during
a probe, but cannot pass the complete-generation acceptance criteria.

An adoption must generate the complete selected contract from its existing Rust
owners plus declarative metadata, including required representation adaptation
and operation forwarding. It must show that the handwritten application WIT,
wire DTOs and structural adapters are unnecessary. The existing schema and
binding probes identify useful mechanisms and concrete gaps; they do not
establish that this full workflow is available. No upstream repair cost or future
savings has been measured.

## Source evidence

- Witty's specialization and generated-name registration explain both the
  positive generic mechanism and the collision limitation.
  [Specialization](https://github.com/linera-io/linera-protocol/blob/672d97bb2fce3127db351069df72f1d225d8f263/linera-witty-macros/src/util/specialization.rs#L43-L96),
  [type registration](https://github.com/linera-io/linera-protocol/blob/672d97bb2fce3127db351069df72f1d225d8f263/linera-witty/src/type_traits/register_wit_types.rs#L31-L53),
  [field names](https://github.com/linera-io/linera-protocol/blob/672d97bb2fce3127db351069df72f1d225d8f263/linera-witty-macros/src/util/fields.rs#L183-L206),
  [schema writer API](https://github.com/linera-io/linera-protocol/blob/672d97bb2fce3127db351069df72f1d225d8f263/linera-witty/src/wit_generation/mod.rs#L14-L58).
- WITGenstein's resolver handles built-ins separately from user types and tracks
  definitions without an instantiation environment. Its generate command writes
  the result without enforcing the declared strict option.
  [Type resolution](https://github.com/tschneidereit/witgenstein/blob/f915331135cd409893890b9fea91cd8a69d2e864/crates/witgenstein-rs/src/resolve.rs#L386-L505),
  [generation command](https://github.com/tschneidereit/witgenstein/blob/f915331135cd409893890b9fea91cd8a69d2e864/crates/witgenstein-rs/src/main.rs#L125-L138).
- Fidius's source collector, field mapper and return mapper distinguish ordinary
  records and containers from aliases, user generics and arbitrary typed errors.
  [Collection](https://github.com/colliery-io/fidius/blob/208b6010f9466c06f54e4cc10d66fa9985f12029/crates/fidius-wit/src/generate.rs#L79-L153),
  [type and return mapping](https://github.com/colliery-io/fidius/blob/208b6010f9466c06f54e4cc10d66fa9985f12029/crates/fidius-wit/src/lib.rs#L182-L294).
- wit-bindgen 0.60's export path still defines individual exported types, while
  record generation can derive `Clone` over remapped field types.
  [Exported types](https://github.com/bytecodealliance/wit-bindgen/blob/1ae00530221542369d0e47ee4a1f4232f09d978d/crates/rust/src/lib.rs#L1316-L1344),
  [record derives](https://github.com/bytecodealliance/wit-bindgen/blob/1ae00530221542369d0e47ee4a1f4232f09d978d/crates/rust/src/interface.rs#L2089-L2132).
