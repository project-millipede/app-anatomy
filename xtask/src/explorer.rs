//! Deterministic presentation data exported from the ordinary Rust Explorer APIs.
//!
//! Fixtures are compiled only by this development task and native qualification
//! targets. Neither the production analyzer nor a component embeds them.

use anyhow::{Context, Result, ensure};
use binary_inspection::{CpuIdentity, explorer::*};
use object::{Wrap, read::ImportLibraryFlags};
use serde_json::{Value, json};
use std::{collections::HashMap, fs, path::Path};

#[path = "../../crates/binary/inspection/fixtures/explorer.rs"]
mod fixtures;

const OUTPUT: &str = "apps/web/features/explorer/previewData.generated.json";

pub fn generate(root: &Path) -> Result<()> {
    let expected = snapshot()?;
    let path = root.join(OUTPUT);
    fs::create_dir_all(path.parent().context("Explorer export has no parent")?)?;
    fs::write(&path, expected).with_context(|| format!("failed to write {}", path.display()))?;
    println!("Generated {OUTPUT} from Rust fixtures and Explorer APIs.");
    Ok(())
}

pub fn check(root: &Path) -> Result<()> {
    let expected = snapshot()?;
    let path = root.join(OUTPUT);
    let actual = fs::read(&path).with_context(|| {
        format!(
            "failed to read {}; run pnpm explorer:generate",
            path.display()
        )
    })?;
    ensure!(
        actual == expected,
        "{OUTPUT} is stale; run pnpm explorer:generate and review the result"
    );
    println!("Explorer preview data is current.");
    Ok(())
}

fn snapshot() -> Result<Vec<u8>> {
    let datasets: Vec<Value> = fixtures::datasets()
        .iter()
        .map(dataset)
        .collect::<Result<_>>()?;
    // serde_json's default map representation sorts keys. Fixture/API vector order
    // is retained, and no timestamps, machine paths, or random IDs are exported.
    let mut bytes = serde_json::to_vec_pretty(&json!({
        "schemaVersion": 1,
        "datasets": datasets,
    }))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn dataset(dataset: &fixtures::Dataset) -> Result<Value> {
    let inventory = &dataset.inventory;
    let entries: Vec<_> = inventory
        .entries()
        .iter()
        .map(|entry| {
            let images: Vec<_> = inventory
                .images()
                .iter()
                .filter(|image| image.entry == entry.id)
                .map(|image| image_id(image.id))
                .collect();
            json!({
                "id": entry_id(entry.id),
                "parentId": entry.parent.map(entry_id),
                "bundleId": entry.bundle.map(entry_id),
                "name": entry.name,
                "path": entry.path,
                "kind": match entry.kind {
                    EntryKind::File => "file",
                    EntryKind::Directory => "directory",
                    EntryKind::Alias => "alias",
                },
                "imageIds": images,
            })
        })
        .collect();
    let images: Vec<_> = inventory
        .images()
        .iter()
        .map(|image| {
            json!({
                "id": image_id(image.id),
                "entryId": entry_id(image.entry),
                "cpu": cpu(image.cpu),
                "installNameBytes": image.install_name,
                "installName": image.install_name.as_deref().map(String::from_utf8_lossy),
            })
        })
        .collect();
    let contexts: Vec<_> = dataset
        .contexts
        .iter()
        .map(|context| {
            json!({
                "id": context.id,
                "label": context.label,
                "architecture": architecture(context.context.architecture),
                "architectureId": architecture_id(context.context.architecture),
                "cpu": cpu(context.context.architecture),
                "executableImageId": context.context.executable.map(image_id),
                "runpaths": context.context.runpaths.iter().map(|runpath| json!({
                    "path": runpath.path,
                    "ownerImageId": image_id(runpath.owner),
                })).collect::<Vec<_>>(),
            })
        })
        .collect();
    let mut relationships = Vec::new();
    let mut neighborhoods = Vec::new();
    for context in &dataset.contexts {
        for relation in inventory.relationships() {
            let resolution = inventory.resolve(relation.id, &context.context)?;
            relationships.push(relationship(inventory, relation, &resolution, context));
        }
        for entry in inventory.entries() {
            let neighborhood = inventory.neighborhood(entry.id, &context.context)?;
            neighborhoods.push(neighborhood_value(&neighborhood, context.id));
        }
    }
    let architecture_coverage = architecture_coverage(inventory, &dataset.file_byte_facts)?;
    Ok(json!({
        "id": dataset.id,
        "label": dataset.label,
        "description": dataset.description,
        "inventoryId": inventory.id().0,
        "rootPath": inventory.root(),
        "initialEntryId": entry_id(dataset.initial_entry),
        "initialContextId": dataset.contexts.first().context("Explorer dataset has no context")?.id,
        "contexts": contexts,
        "entries": entries,
        "images": images,
        "architectureCoverage": architecture_coverage,
        "relationships": relationships,
        "neighborhoods": neighborhoods,
    }))
}

/// Project recorded image coverage in inventory order using the shared exact-CPU query.
fn architecture_coverage(
    inventory: &Inventory,
    file_byte_facts: &[fixtures::FileByteFacts],
) -> Result<Value> {
    let mut recorded_cpus = Vec::new();
    for image in inventory.images() {
        if !recorded_cpus.contains(&image.cpu) {
            recorded_cpus.push(image.cpu);
        }
    }
    let architectures: Vec<_> = recorded_cpus
        .iter()
        .map(|&recorded_cpu| {
            json!({
                "id": architecture_id(recorded_cpu),
                "label": architecture_label(recorded_cpu),
                "cpu": cpu(recorded_cpu),
            })
        })
        .collect();

    let mut byte_layouts = HashMap::new();
    for facts in file_byte_facts {
        let byte_layout = file_byte_layout_value(inventory, facts)?;
        ensure!(
            byte_layouts.insert(facts.entry, byte_layout).is_none(),
            "file byte observations repeat entry {:?}",
            facts.entry,
        );
    }

    let mut binaries = Vec::new();
    for entry in inventory.entries() {
        if !inventory
            .images()
            .iter()
            .any(|image| image.entry == entry.id)
        {
            continue;
        }
        let mut matches = Vec::new();
        for &recorded_cpu in &recorded_cpus {
            let matching_images = inventory.matching_images(entry.id, recorded_cpu)?;
            let image_ids: Vec<_> = matching_images.into_iter().map(image_id).collect();
            matches.push(json!({
                "architectureId": architecture_id(recorded_cpu),
                "imageIds": image_ids,
            }));
        }
        binaries.push(json!({
            "entryId": entry_id(entry.id),
            "matches": matches,
            "byteLayout": byte_layouts.remove(&entry.id),
        }));
    }
    Ok(json!({ "architectures": architectures, "binaries": binaries }))
}

/// Serialize Rust's file partition without rounding byte coordinates for JavaScript.
fn file_byte_layout_value(inventory: &Inventory, facts: &fixtures::FileByteFacts) -> Result<Value> {
    let layout = inventory
        .file_byte_layout(facts.entry, facts.byte_length, &facts.image_ranges)
        .with_context(|| format!("invalid file byte observations for {:?}", facts.entry))?;
    // Rust retains u64 coordinates. This numeric JSON adapter supports exact JS
    // integers only; all validated region coordinates are bounded by this length.
    ensure!(
        layout.byte_length <= 9_007_199_254_740_991,
        "file byte length for {:?} exceeds the exact JavaScript integer range",
        facts.entry,
    );
    let mut regions = Vec::new();
    for region in layout.regions {
        let recorded_architecture_id = match region.image {
            Some(image) => {
                let recorded_image = inventory
                    .image(image)
                    .context("validated file byte region has no inventory image")?;
                Some(architecture_id(recorded_image.cpu))
            }
            None => None,
        };
        let recorded_image_id = region.image.map(image_id);
        regions.push(json!({
            "imageId": recorded_image_id,
            "architectureId": recorded_architecture_id,
            "offset": region.file_range.offset(),
            "size": region.file_range.size(),
            "end": region.file_range.end(),
        }));
    }
    Ok(json!({ "byteLength": layout.byte_length, "regions": regions }))
}

/// Keep the complete recorded type and subtype bits in presentation join keys.
fn architecture_id(cpu: CpuIdentity) -> String {
    format!(
        "{:08x}:{:08x}",
        cpu.cpu_type.into_inner(),
        cpu.cpu_subtype.into_inner()
    )
}

/// Shorten upstream symbolic names for display without changing their identity.
fn architecture_label(cpu: CpuIdentity) -> String {
    let name = architecture(cpu);
    let Some(short_name) = name
        .strip_prefix("CPU_SUBTYPE_")
        .or_else(|| name.strip_prefix("CPU_TYPE_"))
    else {
        return name;
    };
    short_name
        .strip_suffix("_ALL")
        .unwrap_or(short_name)
        .to_ascii_lowercase()
}

fn neighborhood_value(neighborhood: &Neighborhood, context: &str) -> Value {
    let mut north = Vec::new();
    let mut west = Vec::new();
    let mut east = Vec::new();
    let mut south = Vec::new();
    for relation in &neighborhood.relationships {
        let card = json!({
            "relationshipId": contextual_id(relation.relationship, context),
            "endpointIds": relation.endpoints.iter().copied().map(entry_id).collect::<Vec<_>>(),
        });
        match relation.group {
            BridgeGroup::ExternalIngress => north.push(card),
            BridgeGroup::BundleIngress => west.push(card),
            BridgeGroup::BundleEgress => east.push(card),
            BridgeGroup::ExternalEgress => south.push(card),
        }
    }
    json!({
        "entryId": entry_id(neighborhood.selected),
        "contextId": context,
        "north": north,
        "west": west,
        "east": east,
        "south": south,
        "roles": neighborhood.roles.iter().map(|role| json!({
            "entryId": entry_id(role.entry),
            "incoming": role.incoming,
            "outgoing": role.outgoing,
        })).collect::<Vec<_>>(),
    })
}

fn relationship(
    inventory: &Inventory,
    relation: &Relationship,
    resolution: &Resolution,
    context: &fixtures::FixtureContext,
) -> Value {
    let (kind, label, reference, raw, mut evidence, dependency) = evidence(&relation.evidence);
    evidence.push(row(
        "Evidence origin",
        match relation.provenance {
            EvidenceProvenance::Synthetic => "Authored synthetic data",
            EvidenceProvenance::Observed => "Observed facts",
        },
    ));
    let mut context_rows = vec![row(
        "Architecture",
        architecture(context.context.architecture),
    )];
    if let Some(image) = context.context.executable {
        context_rows.push(row("Executable context", image_path(inventory, image)));
    }
    for (index, runpath) in context.context.runpaths.iter().enumerate() {
        context_rows.push(row(
            format!("Runpath {}", index + 1),
            format!(
                "{} · owner {}",
                runpath.path,
                image_path(inventory, runpath.owner)
            ),
        ));
    }
    if let Some(note) = &resolution.note {
        context_rows.push(row("Evaluation limit", note));
    }
    let candidates: Vec<_> = resolution.candidates.iter().map(|candidate| json!({
        "entryId": entry_id(candidate.entry),
        "contextId": context.id,
        "imageId": candidate.image.map(image_id),
        "label": inventory.entry(candidate.entry).expect("validated candidate").name,
        "path": candidate.path,
        "reason": "Candidate in the supplied inventory; loading and access are unverified.",
        "status": "candidate",
        "aliasIds": candidate.aliases.iter().copied().map(entry_id).collect::<Vec<_>>(),
        "aliases": candidate.aliases.iter().map(|id| entry_path(inventory, *id)).collect::<Vec<_>>(),
    })).collect();
    let attempts: Vec<_> = resolution.attempts.iter().map(|attempt| json!({
        "candidateEntryId": Value::Null,
        "path": attempt.path,
        "finalPath": attempt.final_path,
        "status": attempt_status(attempt.outcome),
        "reason": attempt.note.as_deref().unwrap_or(attempt_label(attempt.outcome)),
        "note": attempt.note,
        "runpathOwnerImageId": attempt.runpath_owner.map(image_id),
        "aliasIds": attempt.aliases.iter().copied().map(entry_id).collect::<Vec<_>>(),
        "aliases": attempt.aliases.iter().map(|id| entry_path(inventory, *id)).collect::<Vec<_>>(),
    })).collect();
    let alias_chains: Vec<_> = resolution
        .attempts
        .iter()
        .filter(|attempt| !attempt.aliases.is_empty())
        .map(|attempt| {
            let mut steps: Vec<_> = attempt
                .aliases
                .iter()
                .map(|id| entry_path(inventory, *id))
                .collect();
            steps.push(attempt.final_path.as_str());
            steps.join(" → ")
        })
        .collect();
    json!({
        "id": contextual_id(relation.id, context.id),
        "originalId": relationship_id(relation.id),
        "contextId": context.id,
        "sourceId": entry_id(relation.source),
        "sourceImageId": relation.source_image.map(image_id),
        "targetIds": resolution.candidates.iter().map(|candidate| entry_id(candidate.entry)).collect::<Vec<_>>(),
        "kind": kind,
        "label": label,
        "reference": reference,
        "rawReferenceBytes": raw,
        "status": status(resolution.status),
        "provenance": match relation.provenance {
            EvidenceProvenance::Synthetic => "synthetic",
            EvidenceProvenance::Observed => "observed",
        },
        "suggestedEntryId": relation.suggested_entry.map(entry_id),
        "evidence": evidence,
        "context": context_rows,
        "aliasChain": alias_chains,
        "candidates": candidates,
        "attempts": attempts,
        "externalEndpoint": if resolution.status == ResolutionStatus::External { Some(&reference) } else { None },
        "note": resolution.note,
        "dependency": dependency,
    })
}

fn evidence(
    evidence: &Evidence,
) -> (
    &'static str,
    &'static str,
    String,
    Vec<u8>,
    Vec<Value>,
    Value,
) {
    match evidence {
        Evidence::Dependency {
            install_name,
            flags,
            command,
        } => {
            let reference = String::from_utf8_lossy(install_name).into_owned();
            let mut rows = vec![row("Recorded install name", &reference)];
            let binary = match flags {
                ImportLibraryFlags::MachO {
                    ordinal,
                    cmd,
                    current_version,
                    compatibility_version,
                    use_flags,
                } => {
                    rows.push(row(
                        "Load command",
                        cmd.name()
                            .map(str::to_owned)
                            .unwrap_or_else(|| cmd.to_string()),
                    ));
                    rows.push(row("Library ordinal", ordinal.to_string()));
                    rows.push(row("Current version", current_version.to_string()));
                    rows.push(row(
                        "Compatibility version",
                        compatibility_version.to_string(),
                    ));
                    if let Some(flags) = use_flags {
                        rows.push(row("Use flags", format!("{flags:?}")));
                    }
                    json!({
                        "ordinal": ordinal,
                        "command": { "raw": cmd.into_inner(), "name": cmd.name() },
                        "currentVersion": { "raw": current_version.into_inner(), "display": current_version.to_string() },
                        "compatibilityVersion": { "raw": compatibility_version.into_inner(), "display": compatibility_version.to_string() },
                        "useFlags": use_flags.map(|flags| json!({ "raw": flags.into_inner(), "display": format!("{flags:?}") })),
                        "commandLocation": command.map(|location| json!({
                            "kind": { "raw": location.kind.into_inner(), "name": location.kind.name() },
                            "offset": location.file_range.offset(),
                            "size": location.file_range.size(),
                        })),
                    })
                }
                _ => unreachable!("validated Explorer dependency uses Mach-O flags"),
            };
            (
                "dependency",
                "Dependency reference",
                reference,
                install_name.clone(),
                rows,
                binary,
            )
        }
        Evidence::Alias { stored_target } => (
            "alias",
            "Filesystem alias",
            stored_target.clone(),
            stored_target.as_bytes().to_vec(),
            vec![row("Stored symlink target", stored_target)],
            Value::Null,
        ),
        Evidence::ResourcePath { path, base } => (
            "resource-path",
            "Resource path",
            path.clone(),
            path.as_bytes().to_vec(),
            vec![
                row("Authored resource path", path),
                row("Explicit base entry", entry_id(*base)),
                row(
                    "Evidence limit",
                    "A path match does not establish file access.",
                ),
            ],
            Value::Null,
        ),
        Evidence::ResourceString { value, base } => (
            "resource-string",
            "Resource string",
            value.clone(),
            value.as_bytes().to_vec(),
            vec![
                row("Authored string mention", value),
                row("Explicit base entry", entry_id(*base)),
                row(
                    "Evidence limit",
                    "A string mention does not establish dependency resolution or file access.",
                ),
            ],
            Value::Null,
        ),
    }
}

fn row(label: impl AsRef<str>, value: impl AsRef<str>) -> Value {
    json!({ "label": label.as_ref(), "value": value.as_ref() })
}

fn cpu(cpu: CpuIdentity) -> Value {
    json!({
        "typeRaw": cpu.cpu_type.into_inner(),
        "typeName": cpu.cpu_type.name(),
        "subtypeRaw": cpu.cpu_subtype.into_inner(),
        "subtypeName": cpu.subtype_name(),
    })
}

fn architecture(cpu: CpuIdentity) -> String {
    cpu.subtype_name()
        .or_else(|| cpu.cpu_type.name())
        .map(str::to_owned)
        .unwrap_or_else(|| {
            format!(
                "CPU {} / subtype {}",
                cpu.cpu_type.into_inner(),
                cpu.cpu_subtype.into_inner()
            )
        })
}

fn entry_path(inventory: &Inventory, id: EntryId) -> &str {
    &inventory.entry(id).expect("validated entry identity").path
}

fn image_path(inventory: &Inventory, id: ImageId) -> &str {
    entry_path(
        inventory,
        inventory.image(id).expect("validated image identity").entry,
    )
}

fn entry_id(id: EntryId) -> String {
    format!("{}:{}", id.inventory.0, id.index)
}
fn image_id(id: ImageId) -> String {
    format!("{}:{}", id.inventory.0, id.index)
}
fn relationship_id(id: RelationshipId) -> String {
    format!("{}:{}", id.inventory.0, id.index)
}
fn contextual_id(id: RelationshipId, context: &str) -> String {
    format!("{}@{context}", relationship_id(id))
}

fn status(status: ResolutionStatus) -> &'static str {
    match status {
        ResolutionStatus::Candidates => "candidates",
        ResolutionStatus::External => "external",
        ResolutionStatus::Unresolved => "unresolved",
        ResolutionStatus::Unsupported => "unsupported",
    }
}

fn attempt_status(outcome: AttemptOutcome) -> &'static str {
    match outcome {
        AttemptOutcome::Matched => "matched",
        AttemptOutcome::Missing => "missing",
        AttemptOutcome::ArchitectureMismatch => "architecture-mismatch",
        AttemptOutcome::BrokenAlias => "broken-alias",
        AttemptOutcome::AliasCycle => "alias-cycle",
        AttemptOutcome::AliasLimitExceeded => "alias-limit-exceeded",
        AttemptOutcome::External => "external",
        AttemptOutcome::Unsupported => "unsupported",
    }
}

fn attempt_label(outcome: AttemptOutcome) -> &'static str {
    match outcome {
        AttemptOutcome::Matched => "Candidate found in the supplied inventory.",
        AttemptOutcome::Missing => "No entry at the evaluated inventory path.",
        AttemptOutcome::ArchitectureMismatch => "No image with the exact requested CPU identity.",
        AttemptOutcome::BrokenAlias => "Alias target is absent from the supplied inventory.",
        AttemptOutcome::AliasCycle => "Alias traversal repeated a complete path state.",
        AttemptOutcome::AliasLimitExceeded => "Alias expansion limit exceeded.",
        AttemptOutcome::External => "Evaluated path leaves the acquired inventory.",
        AttemptOutcome::Unsupported => "Required path interpretation context is unavailable.",
    }
}
