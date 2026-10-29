//! Rules owned by the bounded explorer, independent of parser and UI runtimes.

#[allow(dead_code)] // Preview labels are consumed by the separate exporter.
#[path = "../fixtures/explorer.rs"]
mod fixtures;

use binary_inspection::explorer::*;

fn dataset(id: &str) -> fixtures::Dataset {
    fixtures::datasets()
        .into_iter()
        .find(|dataset| dataset.id == id)
        .unwrap()
}
fn entry(inventory: &Inventory, suffix: &str) -> EntryId {
    inventory
        .entries()
        .iter()
        .find(|entry| entry.path.ends_with(suffix))
        .unwrap()
        .id
}
fn dependency(inventory: &Inventory, name: &str) -> RelationshipId {
    inventory.relationships().iter().find(|relation| matches!(&relation.evidence, Evidence::Dependency { install_name, .. } if install_name == name.as_bytes())).unwrap().id
}

#[test]
fn ordered_runpaths_keep_all_candidates_and_use_each_declaring_image() {
    let fixture = dataset("ambiguity");
    let inventory = &fixture.inventory;
    let relation = dependency(inventory, "@rpath/libShared.dylib");
    let resolution = inventory
        .resolve(relation, &fixture.contexts[0].context)
        .unwrap();
    assert_eq!(resolution.status, ResolutionStatus::Candidates);
    let candidate_paths: Vec<_> = resolution
        .candidates
        .iter()
        .map(|candidate| candidate.path.as_str())
        .collect();
    assert_eq!(
        candidate_paths,
        [
            "/Ambiguity.app/Contents/Frameworks/Two/libShared.dylib",
            "/Ambiguity.app/Contents/Frameworks/One/libShared.dylib"
        ]
    );
    assert_eq!(
        resolution
            .attempts
            .iter()
            .map(|attempt| attempt.outcome)
            .collect::<Vec<_>>(),
        [
            AttemptOutcome::Matched,
            AttemptOutcome::Missing,
            AttemptOutcome::Matched,
            AttemptOutcome::ArchitectureMismatch
        ]
    );
    assert_ne!(
        resolution.attempts[0].runpath_owner,
        resolution.attempts[2].runpath_owner
    );
}

#[test]
fn architecture_context_filters_referring_images_and_target_candidates() {
    let fixture = dataset("ambiguity");
    let neighborhood = fixture
        .inventory
        .neighborhood(fixture.initial_entry, &fixture.contexts[1].context)
        .unwrap();
    assert_eq!(neighborhood.relationships.len(), 1);
    assert_eq!(neighborhood.relationships[0].resolution.candidates.len(), 1);
    assert!(
        neighborhood.relationships[0].resolution.candidates[0]
            .path
            .ends_with("/One/libShared.dylib")
    );
    assert_eq!(neighborhood.roles.len(), 1);
}

#[test]
fn preview_activates_direct_endpoints_while_alias_chain_stays_evidence() {
    let fixture = dataset("atlas");
    let inventory = &fixture.inventory;
    let context = &fixture.contexts[0].context;
    let main = entry(inventory, "/MacOS/Atlas");
    let alias = entry(inventory, "/Example.framework/Example");
    let current = entry(inventory, "/Versions/Current");
    let neighborhood = inventory.neighborhood(main, context).unwrap();
    assert_eq!(neighborhood.selected, main);
    assert_eq!(
        neighborhood.relationships[0].endpoints,
        [fixture.initial_entry]
    );
    assert_eq!(
        neighborhood.relationships[0].resolution.candidates[0].aliases,
        [alias, current]
    );
    assert!(
        !neighborhood
            .roles
            .iter()
            .any(|role| role.entry == alias || role.entry == current)
    );
    let alias_neighborhood = inventory.neighborhood(alias, context).unwrap();
    assert_eq!(alias_neighborhood.relationships.len(), 1);
    assert_eq!(
        alias_neighborhood.relationships[0].group,
        BridgeGroup::BundleEgress
    );
    assert_eq!(
        alias_neighborhood.relationships[0].endpoints,
        [fixture.initial_entry]
    );
    // The selected canonical file still receives the direct alias source.
    let canonical = inventory
        .neighborhood(fixture.initial_entry, context)
        .unwrap();
    assert!(
        canonical
            .roles
            .iter()
            .any(|role| role.entry == alias && role.incoming)
    );
    assert!(!canonical.roles.iter().any(|role| role.entry == current));
}

#[test]
fn broken_cyclic_and_external_aliases_retain_distinct_failed_attempts() {
    let fixture = dataset("incomplete");
    let inventory = &fixture.inventory;
    let context = &fixture.contexts[0].context;
    let broken = inventory
        .resolve(dependency(inventory, "@rpath/Broken"), context)
        .unwrap();
    assert_eq!(broken.status, ResolutionStatus::Unresolved);
    assert_eq!(broken.attempts[0].outcome, AttemptOutcome::BrokenAlias);
    assert!(broken.attempts[0].final_path.ends_with("/Missing.dylib"));
    let cycle = inventory
        .resolve(dependency(inventory, "@rpath/CycleA"), context)
        .unwrap();
    assert_eq!(cycle.attempts[0].outcome, AttemptOutcome::AliasCycle);
    assert_eq!(cycle.attempts[0].aliases.len(), 2);
    let external = inventory
        .resolve(dependency(inventory, "@rpath/Outside"), context)
        .unwrap();
    assert_eq!(external.status, ResolutionStatus::External);
    assert_eq!(
        external.attempts[0].final_path,
        "/Library/Frameworks/Outside.framework/Outside"
    );
    assert!(external.candidates.is_empty());
}

#[test]
fn annotations_and_unsupported_references_do_not_manufacture_active_targets() {
    let fixture = dataset("incomplete");
    let inventory = &fixture.inventory;
    let context = &fixture.contexts[0].context;
    let relation = inventory
        .relationship(dependency(inventory, "/usr/lib/libSuggested.dylib"))
        .unwrap();
    let suggested = relation.suggested_entry.unwrap();
    let resolution = inventory.resolve(relation.id, context).unwrap();
    assert_eq!(resolution.status, ResolutionStatus::External);
    assert!(resolution.candidates.is_empty());
    let neighborhood = inventory
        .neighborhood(fixture.initial_entry, context)
        .unwrap();
    assert!(
        !neighborhood
            .roles
            .iter()
            .any(|role| role.entry == suggested)
    );
    let unsupported = inventory
        .resolve(dependency(inventory, "@unknown/libMystery.dylib"), context)
        .unwrap();
    assert_eq!(unsupported.status, ResolutionStatus::Unsupported);
    assert!(unsupported.note.is_some());
}

#[test]
fn unsupported_runpath_preserves_other_ordered_attempts_and_matches() {
    let fixture = dataset("ambiguity");
    let mut context = fixture.contexts[0].context.clone();
    let owner = context.runpaths[0].owner;
    context.runpaths.insert(
        1,
        Runpath {
            path: "@unknown/Frameworks".into(),
            owner,
        },
    );
    let result = fixture
        .inventory
        .resolve(
            dependency(&fixture.inventory, "@rpath/libShared.dylib"),
            &context,
        )
        .unwrap();
    assert_eq!(result.status, ResolutionStatus::Candidates);
    assert_eq!(result.candidates.len(), 2);
    assert_eq!(result.attempts.len(), 5);
    assert_eq!(result.attempts[1].outcome, AttemptOutcome::Unsupported);
    assert!(result.attempts[1].note.is_some());
    assert_eq!(result.attempts[3].outcome, AttemptOutcome::Matched);
}

#[test]
fn snapshots_reject_foreign_identity_and_dangling_annotations() {
    let fixtures = fixtures::datasets();
    let atlas = &fixtures[0];
    let other = &fixtures[1];
    assert!(
        atlas
            .inventory
            .neighborhood(other.initial_entry, &atlas.contexts[0].context)
            .is_err()
    );
    let mut relationships = atlas.inventory.relationships().to_vec();
    relationships[0].suggested_entry = Some(other.initial_entry);
    assert!(
        Inventory::new(
            atlas.inventory.id(),
            atlas.inventory.root().into(),
            atlas.inventory.entries().to_vec(),
            atlas.inventory.images().to_vec(),
            relationships
        )
        .is_err()
    );
    let mut context = atlas.contexts[0].context.clone();
    context.executable = other.contexts[0].context.executable;
    assert!(
        atlas
            .inventory
            .neighborhood(atlas.initial_entry, &context)
            .is_err()
    );
}

#[test]
fn dense_projection_stays_one_hop_and_does_not_import_targets_external_edges() {
    let fixture = dataset("dense");
    let neighborhood = fixture
        .inventory
        .neighborhood(fixture.initial_entry, &fixture.contexts[0].context)
        .unwrap();
    assert_eq!(neighborhood.relationships.len(), 19);
    assert_eq!(neighborhood.roles.len(), 19);
    assert!(
        neighborhood
            .relationships
            .iter()
            .all(|relation| relation.group == BridgeGroup::BundleEgress)
    );
    assert!(
        neighborhood
            .roles
            .iter()
            .all(|role| role.outgoing && !role.incoming)
    );
}

#[test]
fn repeated_evidence_keeps_records_but_combines_bidirectional_tree_roles() {
    let fixture = dataset("ambiguity");
    let inventory = &fixture.inventory;
    let one = entry(inventory, "/One/libShared.dylib");
    let neighborhood = inventory
        .neighborhood(fixture.initial_entry, &fixture.contexts[0].context)
        .unwrap();
    assert_eq!(neighborhood.relationships.len(), 3);
    assert_eq!(
        neighborhood
            .relationships
            .iter()
            .filter(|relation| relation.endpoints.contains(&one))
            .count(),
        3
    );
    let roles: Vec<_> = neighborhood
        .roles
        .iter()
        .filter(|role| role.entry == one)
        .collect();
    assert_eq!(roles.len(), 1);
    assert!(roles[0].incoming && roles[0].outgoing);
}

fn alias_traversal_inventory() -> (Inventory, ResolutionContext) {
    let id = InventoryId(99);
    let entry_id = |index| EntryId {
        inventory: id,
        index,
    };
    let relation_id = |index| RelationshipId {
        inventory: id,
        index,
    };
    let entries = [
        ("/App", EntryKind::Directory, None),
        ("/App/Dir", EntryKind::Directory, Some(entry_id(0))),
        ("/App/Dir/file", EntryKind::File, Some(entry_id(1))),
        ("/App/A", EntryKind::Alias, Some(entry_id(0))),
        ("/App/Dir/up", EntryKind::Alias, Some(entry_id(1))),
        ("/App/source", EntryKind::File, Some(entry_id(0))),
        ("/App/Grow", EntryKind::Alias, Some(entry_id(0))),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (path, kind, parent))| Entry {
        id: entry_id(index as u32),
        name: path.rsplit('/').next().unwrap().into(),
        path: path.into(),
        parent,
        bundle: None,
        kind,
    })
    .collect();
    let relationship = |index, source, evidence| Relationship {
        id: relation_id(index),
        source,
        source_image: None,
        evidence,
        provenance: EvidenceProvenance::Synthetic,
        suggested_entry: None,
    };
    let relationships = vec![
        relationship(
            0,
            entry_id(3),
            Evidence::Alias {
                stored_target: "Dir".into(),
            },
        ),
        relationship(
            1,
            entry_id(4),
            Evidence::Alias {
                stored_target: "..".into(),
            },
        ),
        relationship(
            2,
            entry_id(5),
            Evidence::ResourcePath {
                path: "A/up/A/file".into(),
                base: entry_id(0),
            },
        ),
        relationship(
            3,
            entry_id(6),
            Evidence::Alias {
                stored_target: "Grow/tail".into(),
            },
        ),
        relationship(
            4,
            entry_id(5),
            Evidence::ResourcePath {
                path: "Grow/file".into(),
                base: entry_id(0),
            },
        ),
    ];
    let inventory = Inventory::new(id, "/App".into(), entries, Vec::new(), relationships).unwrap();
    let context = ResolutionContext {
        architecture: fixtures::arm64(),
        executable: None,
        runpaths: Vec::new(),
    };
    (inventory, context)
}

#[test]
fn alias_revisit_with_a_shorter_suffix_resolves_and_retains_the_full_trace() {
    let (inventory, context) = alias_traversal_inventory();
    let result = inventory
        .resolve(
            RelationshipId {
                inventory: inventory.id(),
                index: 2,
            },
            &context,
        )
        .unwrap();
    assert_eq!(result.status, ResolutionStatus::Candidates);
    assert_eq!(result.candidates[0].path, "/App/Dir/file");
    let a = entry(&inventory, "/A");
    let up = entry(&inventory, "/Dir/up");
    assert_eq!(result.candidates[0].aliases, [a, up, a]);
    assert_eq!(result.attempts[0].outcome, AttemptOutcome::Matched);
}

#[test]
fn growing_alias_expansions_exhaust_the_evaluator_budget_without_claiming_a_cycle() {
    let (inventory, context) = alias_traversal_inventory();
    let result = inventory
        .resolve(
            RelationshipId {
                inventory: inventory.id(),
                index: 4,
            },
            &context,
        )
        .unwrap();
    assert_eq!(result.status, ResolutionStatus::Unsupported);
    assert!(result.candidates.is_empty());
    let attempt = &result.attempts[0];
    assert_eq!(attempt.outcome, AttemptOutcome::AliasLimitExceeded);
    assert_eq!(attempt.aliases.len(), MAX_ALIAS_EXPANSIONS);
    assert!(
        attempt
            .note
            .as_deref()
            .unwrap()
            .contains("64-expansion budget")
    );
}
