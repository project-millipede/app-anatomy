//! Owned, inventory-bounded application relationships and synthetic dependency candidates.
//!
//! This module evaluates supplied facts without opening files or reproducing dyld.
//! Candidate matches use exact CPU identities and lexical paths. They do not prove
//! loading, access, signature validity or execution eligibility.

mod resolve;

use std::collections::{HashMap, HashSet};
use std::fmt;

use object::read::ImportLibraryFlags;

use crate::{CommandLocation, CpuIdentity};

/// Maximum alias substitutions per path attempt in this bounded evaluator.
///
/// This is an evaluator budget, independent of operating-system symlink limits.
/// Exhaustion reports incomplete evaluation, never proof of a filesystem cycle.
pub const MAX_ALIAS_EXPANSIONS: usize = 64;

/// Identity of one caller-owned inventory snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct InventoryId(pub u32);

macro_rules! scoped_id {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub struct $name {
            /// Owning snapshot; identifiers from another snapshot are rejected.
            pub inventory: InventoryId,
            /// Identity within that snapshot, independent of display names.
            pub index: u32,
        }
    };
}
scoped_id!(
    EntryId,
    "Identity of an inventory entry, including alias entries."
);
scoped_id!(
    ImageId,
    "Identity of one architecture-specific binary image."
);
scoped_id!(RelationshipId, "Identity of one recorded relationship.");

/// Observed or authored filesystem entry kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    /// Regular file.
    File,
    /// Directory or bundle directory.
    Directory,
    /// Distinct symbolic-link entry; its stored target is alias evidence.
    Alias,
}

/// One entry, identified independently of its possibly repeated display name.
#[derive(Debug, Clone)]
pub struct Entry {
    /// Snapshot-scoped identity.
    pub id: EntryId,
    /// Display label, never used for resolution.
    pub name: String,
    /// Normalized absolute synthetic inventory path.
    pub path: String,
    /// Containing directory, absent only at the inventory root.
    pub parent: Option<EntryId>,
    /// Nearest authored bundle directory, if known.
    pub bundle: Option<EntryId>,
    /// Entry kind without following aliases.
    pub kind: EntryKind,
}

/// One physical architecture-specific image in an entry.
#[derive(Debug, Clone)]
pub struct Image {
    /// Snapshot-scoped identity.
    pub id: ImageId,
    /// Containing file entry.
    pub entry: EntryId,
    /// Complete declared CPU identity, reused from the ordinary inspection API.
    pub cpu: CpuIdentity,
    /// Optional LC_ID_DYLIB name bytes, retained independently of display text.
    pub install_name: Option<Vec<u8>>,
}

/// Evidence supplied by a caller; resource mentions remain weaker than dependencies.
#[derive(Debug, Clone)]
pub enum Evidence {
    /// A library load command, using upstream flags and versions directly.
    Dependency {
        /// Original install-name bytes.
        install_name: Vec<u8>,
        /// Upstream Mach-O command/ordinal/version/use-flag facts.
        flags: ImportLibraryFlags,
        /// Actual command location when extracted; absent for authored fixtures.
        command: Option<CommandLocation>,
    },
    /// Stored symbolic-link text, relative to its entry's containing directory.
    Alias {
        /// Original authored target text.
        stored_target: String,
    },
    /// Authored resource-path association; it does not establish resource access.
    ResourcePath {
        /// Resource path spelling.
        path: String,
        /// Explicit directory against which a relative path is interpreted.
        base: EntryId,
    },
    /// Authored string mention; it does not establish a dependency or resource access.
    ResourceString {
        /// Mentioned path spelling.
        value: String,
        /// Explicit directory against which a relative mention is interpreted.
        base: EntryId,
    },
}

/// Origin of the recorded facts, independent of whether a candidate exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvidenceProvenance {
    /// Deliberately authored demonstration facts.
    Synthetic,
    /// Facts observed through a separately qualified acquisition/parser path.
    Observed,
}

/// One recorded relationship before candidate evaluation.
#[derive(Debug, Clone)]
pub struct Relationship {
    /// Snapshot-scoped identity.
    pub id: RelationshipId,
    /// Source entry; aliases and targets are never merged.
    pub source: EntryId,
    /// Referring image for binary evidence, absent for architecture-independent evidence.
    pub source_image: Option<ImageId>,
    /// Recorded evidence without an implied runtime conclusion.
    pub evidence: Evidence,
    /// Whether facts were authored or observed.
    pub provenance: EvidenceProvenance,
    /// Optional human annotation; never a resolution candidate or active endpoint.
    pub suggested_entry: Option<EntryId>,
}

/// One ordered runpath with its declaring image retained for @loader_path expansion.
#[derive(Debug, Clone)]
pub struct Runpath {
    /// Raw runpath spelling.
    pub path: String,
    /// Image which declared this runpath.
    pub owner: ImageId,
}

/// Explicit context for bounded candidate evaluation, not an inferred loader environment.
#[derive(Debug, Clone)]
pub struct ResolutionContext {
    /// Exact CPU identity required for a binary candidate.
    pub architecture: CpuIdentity,
    /// Selected executable context for @executable_path.
    pub executable: Option<ImageId>,
    /// Caller-supplied search order, preserving each runpath's owner.
    pub runpaths: Vec<Runpath>,
}

/// Summary of the supplied evidence's candidate evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolutionStatus {
    /// One or more plausible internal targets; no loader choice is asserted.
    Candidates,
    /// All evaluated paths leave the acquired inventory.
    External,
    /// Evaluated paths have no suitable target inside the inventory.
    Unresolved,
    /// Required context or supported path interpretation is unavailable.
    Unsupported,
}

/// A plausible target, preserving aliases traversed on the way to its identity.
#[derive(Debug, Clone)]
pub struct Candidate {
    /// Final target entry.
    pub entry: EntryId,
    /// Matching binary image for dependencies, absent for filesystem/resource evidence.
    pub image: Option<ImageId>,
    /// Final lexical target path.
    pub path: String,
    /// Alias entries in traversal order, including directory aliases.
    pub aliases: Vec<EntryId>,
}

/// Result of one ordered path attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttemptOutcome {
    /// A suitable internal target was found.
    Matched,
    /// No inventory entry has the evaluated path.
    Missing,
    /// The file has no image with the exact requested CPU identity.
    ArchitectureMismatch,
    /// An alias chain reaches an absent entry.
    BrokenAlias,
    /// Alias traversal repeats the same normalized path state.
    AliasCycle,
    /// The evaluator's alias-substitution budget was exhausted without proving a cycle.
    AliasLimitExceeded,
    /// The lexical path is outside the acquired inventory.
    External,
    /// This individual runpath cannot be expanded with the supplied context.
    Unsupported,
}

/// One attempted spelling, its runpath provenance and alias trace.
#[derive(Debug, Clone)]
pub struct Attempt {
    /// Expanded path before alias traversal.
    pub path: String,
    /// Final evaluated path after alias traversal, including failed traversals.
    pub final_path: String,
    /// Owner of the runpath that produced this attempt, if any.
    pub runpath_owner: Option<ImageId>,
    /// Evaluation result.
    pub outcome: AttemptOutcome,
    /// Alias identities visited before completion or rejection.
    pub aliases: Vec<EntryId>,
    /// Explanation for an unsupported individual attempt.
    pub note: Option<String>,
}

/// Candidate evaluation for one relationship and explicit context.
#[derive(Debug, Clone)]
pub struct Resolution {
    /// Evaluated relationship identity.
    pub relationship: RelationshipId,
    /// Summary, distinct from evidence strength.
    pub status: ResolutionStatus,
    /// Every plausible target; duplicate attempts are retained in `attempts`.
    pub candidates: Vec<Candidate>,
    /// Search order and failed attempts remain inspectable.
    pub attempts: Vec<Attempt>,
    /// Explanation when context or interpretation is unsupported.
    pub note: Option<String>,
}

/// Position of a relationship around the selected entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BridgeGroup {
    /// Internal sources referring to the selected entry.
    BundleIngress,
    /// Internal target candidates of the selected entry.
    BundleEgress,
    /// External sources; no such records are synthesized by this inventory API.
    ExternalIngress,
    /// External or unresolved outgoing references.
    ExternalEgress,
}

/// One directly related card and its tree endpoints.
#[derive(Debug, Clone)]
pub struct NeighborhoodRelationship {
    /// Relationship identity.
    pub relationship: RelationshipId,
    /// Group around the selected entry.
    pub group: BridgeGroup,
    /// Related tree endpoints, excluding the selected entry itself.
    pub endpoints: Vec<EntryId>,
    /// Evidence evaluation for the supplied context.
    pub resolution: Resolution,
}

/// Tree activation derived from the selected entry's immediate relationships.
#[derive(Debug, Clone)]
pub struct TreeRole {
    /// Related entry.
    pub entry: EntryId,
    /// Entry acts as a source into the selection.
    pub incoming: bool,
    /// Entry acts as a direct outgoing candidate.
    pub outgoing: bool,
}

/// One-hop projection; querying it never changes the selected entry.
#[derive(Debug, Clone)]
pub struct Neighborhood {
    /// Selected entry identity.
    pub selected: EntryId,
    /// Direct incoming/outgoing evidence only.
    pub relationships: Vec<NeighborhoodRelationship>,
    /// Combined endpoint roles in inventory order.
    pub roles: Vec<TreeRole>,
}

/// Invalid inventory structure or a query using foreign/missing identities.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InventoryError(pub String);

impl fmt::Display for InventoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}
impl std::error::Error for InventoryError {}

/// Validated immutable facts for one bounded inventory.
#[derive(Debug, Clone)]
pub struct Inventory {
    id: InventoryId,
    root: String,
    entries: Vec<Entry>,
    images: Vec<Image>,
    relationships: Vec<Relationship>,
    entry_index: HashMap<EntryId, usize>,
    image_index: HashMap<ImageId, usize>,
    relationship_index: HashMap<RelationshipId, usize>,
    paths: HashMap<String, EntryId>,
    aliases: HashMap<EntryId, String>,
}

impl Inventory {
    /// Validate identities, containment and evidence before exposing queries.
    pub fn new(
        id: InventoryId,
        root: String,
        entries: Vec<Entry>,
        images: Vec<Image>,
        relationships: Vec<Relationship>,
    ) -> Result<Self, InventoryError> {
        let mut inventory = Self {
            id,
            root,
            entries,
            images,
            relationships,
            entry_index: HashMap::new(),
            image_index: HashMap::new(),
            relationship_index: HashMap::new(),
            paths: HashMap::new(),
            aliases: HashMap::new(),
        };
        inventory.validate()?;
        Ok(inventory)
    }
    /// Snapshot identity.
    pub fn id(&self) -> InventoryId {
        self.id
    }
    /// Absolute acquired root; evaluation never opens a path beyond it.
    pub fn root(&self) -> &str {
        &self.root
    }
    /// Entries in caller-supplied stable order.
    pub fn entries(&self) -> &[Entry] {
        &self.entries
    }
    /// Images in caller-supplied stable order.
    pub fn images(&self) -> &[Image] {
        &self.images
    }
    /// Relationships in recorded order.
    pub fn relationships(&self) -> &[Relationship] {
        &self.relationships
    }
    /// Lookup only accepts an identity from this inventory.
    pub fn entry(&self, id: EntryId) -> Option<&Entry> {
        self.entry_index.get(&id).map(|index| &self.entries[*index])
    }
    /// Lookup one image.
    pub fn image(&self, id: ImageId) -> Option<&Image> {
        self.image_index.get(&id).map(|index| &self.images[*index])
    }
    /// Lookup one relationship.
    pub fn relationship(&self, id: RelationshipId) -> Option<&Relationship> {
        self.relationship_index
            .get(&id)
            .map(|index| &self.relationships[*index])
    }

    fn validate(&mut self) -> Result<(), InventoryError> {
        let invalid = |message: &str| InventoryError(message.into());
        if resolve::normalize(&self.root).as_deref() != Some(self.root.as_str()) {
            return Err(invalid("inventory root must be a normalized absolute path"));
        }
        for (index, entry) in self.entries.iter().enumerate() {
            if entry.id.inventory != self.id || self.entry_index.insert(entry.id, index).is_some() {
                return Err(invalid(
                    "entry identities must be unique within this inventory",
                ));
            }
            if resolve::normalize(&entry.path).as_deref() != Some(entry.path.as_str())
                || !self.contains(&entry.path)
                || self.paths.insert(entry.path.clone(), entry.id).is_some()
            {
                return Err(invalid(
                    "entry paths must be unique normalized paths inside the inventory",
                ));
            }
        }
        let mut root_count = 0;
        for entry in &self.entries {
            if let Some(parent_id) = entry.parent {
                let parent = self
                    .entry(parent_id)
                    .ok_or_else(|| invalid("entry parent is missing or foreign"))?;
                if parent.kind != EntryKind::Directory
                    || resolve::parent(&entry.path) != parent.path
                {
                    return Err(invalid("entry parent must be its containing directory"));
                }
            } else if entry.path == self.root && entry.kind == EntryKind::Directory {
                root_count += 1;
            } else {
                return Err(invalid("only the inventory root may lack a parent"));
            }
            if let Some(bundle) = entry.bundle {
                let bundle = self
                    .entry(bundle)
                    .ok_or_else(|| invalid("entry bundle is missing or foreign"))?;
                if bundle.kind != EntryKind::Directory
                    || !(entry.path == bundle.path
                        || entry.path.starts_with(&format!("{}/", bundle.path)))
                {
                    return Err(invalid("entry bundle must contain the entry"));
                }
            }
        }
        if root_count != 1 {
            return Err(invalid("inventory must contain exactly one root directory"));
        }
        for (index, image) in self.images.iter().enumerate() {
            if image.id.inventory != self.id || self.image_index.insert(image.id, index).is_some() {
                return Err(invalid(
                    "image identities must be unique within this inventory",
                ));
            }
            if self
                .entry(image.entry)
                .is_none_or(|entry| entry.kind != EntryKind::File)
            {
                return Err(invalid("images must belong to file entries"));
            }
        }
        for (index, relation) in self.relationships.iter().enumerate() {
            if relation.id.inventory != self.id
                || self.relationship_index.insert(relation.id, index).is_some()
            {
                return Err(invalid(
                    "relationship identities must be unique within this inventory",
                ));
            }
            let source = self
                .entry(relation.source)
                .ok_or_else(|| invalid("relationship source is missing or foreign"))?;
            if let Some(image) = relation.source_image
                && self
                    .image(image)
                    .is_none_or(|image| image.entry != source.id)
            {
                return Err(invalid(
                    "referring image must belong to the relationship source",
                ));
            }
            if relation
                .suggested_entry
                .is_some_and(|id| self.entry(id).is_none())
            {
                return Err(invalid("suggested entry is missing or foreign"));
            }
            match &relation.evidence {
                Evidence::Dependency { flags, .. } => {
                    if relation.source_image.is_none()
                        || !matches!(flags, ImportLibraryFlags::MachO { .. })
                    {
                        return Err(invalid(
                            "dependency evidence requires a referring image and Mach-O flags",
                        ));
                    }
                }
                Evidence::Alias { stored_target } => {
                    if source.kind != EntryKind::Alias
                        || relation.source_image.is_some()
                        || self
                            .aliases
                            .insert(source.id, stored_target.clone())
                            .is_some()
                    {
                        return Err(invalid(
                            "each alias must have exactly one architecture-independent alias record",
                        ));
                    }
                }
                Evidence::ResourcePath { base, .. } | Evidence::ResourceString { base, .. } => {
                    if relation.source_image.is_some()
                        || self
                            .entry(*base)
                            .is_none_or(|entry| entry.kind != EntryKind::Directory)
                    {
                        return Err(invalid(
                            "resource evidence requires an explicit directory base",
                        ));
                    }
                }
            }
        }
        if self
            .entries
            .iter()
            .any(|entry| entry.kind == EntryKind::Alias && !self.aliases.contains_key(&entry.id))
        {
            return Err(invalid("alias entry lacks its stored target evidence"));
        }
        Ok(())
    }

    fn contains(&self, path: &str) -> bool {
        self.root == "/"
            || path == self.root
            || path
                .strip_prefix(&self.root)
                .is_some_and(|tail| tail.starts_with('/'))
    }
    fn validate_context(&self, context: &ResolutionContext) -> Result<(), InventoryError> {
        for image in context
            .executable
            .into_iter()
            .chain(context.runpaths.iter().map(|runpath| runpath.owner))
        {
            if self.image(image).is_none() {
                return Err(InventoryError(
                    "context image is missing or belongs to another inventory".into(),
                ));
            }
        }
        Ok(())
    }

    /// Derive direct relationships and endpoint roles for one selection/context.
    pub fn neighborhood(
        &self,
        selected: EntryId,
        context: &ResolutionContext,
    ) -> Result<Neighborhood, InventoryError> {
        if self.entry(selected).is_none() {
            return Err(InventoryError(
                "selected entry is missing or foreign".into(),
            ));
        }
        self.validate_context(context)?;
        let mut relationships = Vec::new();
        let mut incoming = HashSet::new();
        let mut outgoing = HashSet::new();
        for relation in &self.relationships {
            if relation
                .source_image
                .and_then(|id| self.image(id))
                .is_some_and(|image| image.cpu != context.architecture)
            {
                continue;
            }
            let resolution = self.resolve(relation.id, context)?;
            let is_outgoing = relation.source == selected;
            let is_incoming = !is_outgoing
                && resolution
                    .candidates
                    .iter()
                    .any(|candidate| candidate.entry == selected);
            if !is_outgoing && !is_incoming {
                continue;
            }
            let mut endpoints = Vec::new();
            if is_outgoing {
                for candidate in &resolution.candidates {
                    let entry = candidate.entry;
                    if entry != selected && !endpoints.contains(&entry) {
                        endpoints.push(entry);
                        outgoing.insert(entry);
                    }
                }
            } else {
                endpoints.push(relation.source);
                incoming.insert(relation.source);
            }
            let group = if is_incoming {
                BridgeGroup::BundleIngress
            } else if resolution.candidates.is_empty() {
                BridgeGroup::ExternalEgress
            } else {
                BridgeGroup::BundleEgress
            };
            relationships.push(NeighborhoodRelationship {
                relationship: relation.id,
                group,
                endpoints,
                resolution,
            });
        }
        let roles = self
            .entries
            .iter()
            .filter_map(|entry| {
                let role = TreeRole {
                    entry: entry.id,
                    incoming: incoming.contains(&entry.id),
                    outgoing: outgoing.contains(&entry.id),
                };
                (role.incoming || role.outgoing).then_some(role)
            })
            .collect();
        Ok(Neighborhood {
            selected,
            relationships,
            roles,
        })
    }
}
