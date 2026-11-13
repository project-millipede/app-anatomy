//! Authored explorer examples shared by native tests and the preview exporter.
//! No binary parser or native inventory acquisition is claimed by these fixtures.

use binary_inspection::{CpuIdentity, FileRange, explorer::*};
use object::{macho, read::ImportLibraryFlags};

/// One reproducible, explicitly synthetic demonstration inventory.
pub struct Dataset {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub inventory: Inventory,
    /// Authored byte observations; omitted files have no recorded size or ranges.
    pub file_byte_facts: Vec<FileByteFacts>,
    pub contexts: Vec<FixtureContext>,
    pub initial_entry: EntryId,
}

/// Explicit synthetic file length and the image ranges recorded within it.
pub struct FileByteFacts {
    /// Exact file entry whose length was authored.
    pub entry: EntryId,
    /// Whole-file length, not an image count or memory measurement.
    pub byte_length: u64,
    /// Known image spans; absent spans remain unassigned.
    pub image_ranges: Vec<ImageByteRange>,
}

/// Construct an image span from the fixture's bounded numeric literals.
fn image_byte_range(image: ImageId, offset: u64, size: u64) -> ImageByteRange {
    let file_range = FileRange::new(offset, size)
        .expect("authored fixture byte-range literals must not overflow");
    ImageByteRange { image, file_range }
}

/// Named, fully supplied interpretation context.
pub struct FixtureContext {
    pub id: &'static str,
    pub label: &'static str,
    pub context: ResolutionContext,
}

pub fn arm64() -> CpuIdentity {
    CpuIdentity {
        cpu_type: macho::CPU_TYPE_ARM64,
        cpu_subtype: macho::CPU_SUBTYPE_ARM64_ALL.into(),
    }
}
pub fn x86_64() -> CpuIdentity {
    CpuIdentity {
        cpu_type: macho::CPU_TYPE_X86_64,
        cpu_subtype: macho::CPU_SUBTYPE_X86_64_ALL.into(),
    }
}

/// The four intentionally different interaction/resolution scenarios.
pub fn datasets() -> Vec<Dataset> {
    vec![atlas(), ambiguity(), incomplete(), dense()]
}

struct Builder {
    id: InventoryId,
    root: String,
    entries: Vec<Entry>,
    images: Vec<Image>,
    relationships: Vec<Relationship>,
}
impl Builder {
    fn new(id: u32, root: &str) -> Self {
        let mut builder = Self {
            id: InventoryId(id),
            root: root.into(),
            entries: Vec::new(),
            images: Vec::new(),
            relationships: Vec::new(),
        };
        builder.entry(root, EntryKind::Directory);
        builder
    }
    fn entry(&mut self, path: &str, kind: EntryKind) -> EntryId {
        if let Some(entry) = self.entries.iter().find(|entry| entry.path == path) {
            return entry.id;
        }
        let parent = if path == self.root {
            None
        } else {
            let path = path.rsplit_once('/').unwrap().0;
            Some(self.entry(path, EntryKind::Directory))
        };
        let id = EntryId {
            inventory: self.id,
            index: self.entries.len() as u32,
        };
        let bundle = self
            .entries
            .iter()
            .rev()
            .find(|entry| {
                entry.kind == EntryKind::Directory
                    && (entry.path.ends_with(".app") || entry.path.ends_with(".framework"))
                    && path.starts_with(&format!("{}/", entry.path))
            })
            .map(|entry| entry.id);
        self.entries.push(Entry {
            id,
            name: path.rsplit('/').next().unwrap().into(),
            path: path.into(),
            parent,
            bundle,
            kind,
        });
        id
    }
    fn file(&mut self, suffix: &str) -> EntryId {
        self.entry(&format!("{}{suffix}", self.root), EntryKind::File)
    }
    fn directory(&mut self, suffix: &str) -> EntryId {
        self.entry(&format!("{}{suffix}", self.root), EntryKind::Directory)
    }
    fn image(&mut self, entry: EntryId, cpu: CpuIdentity) -> ImageId {
        let id = ImageId {
            inventory: self.id,
            index: self.images.len() as u32,
        };
        self.images.push(Image {
            id,
            entry,
            cpu,
            install_name: None,
        });
        id
    }
    fn relation(
        &mut self,
        source: EntryId,
        source_image: Option<ImageId>,
        evidence: Evidence,
    ) -> RelationshipId {
        let id = RelationshipId {
            inventory: self.id,
            index: self.relationships.len() as u32,
        };
        self.relationships.push(Relationship {
            id,
            source,
            source_image,
            evidence,
            provenance: EvidenceProvenance::Synthetic,
            suggested_entry: None,
        });
        id
    }
    fn dependency(
        &mut self,
        source: ImageId,
        name: &str,
        cmd: macho::LoadCommandType,
    ) -> RelationshipId {
        let entry = self
            .images
            .iter()
            .find(|image| image.id == source)
            .unwrap()
            .entry;
        let ordinal = self
            .relationships
            .iter()
            .filter(|relation| relation.source_image == Some(source))
            .count() as u32
            + 1;
        self.relation(
            entry,
            Some(source),
            Evidence::Dependency {
                install_name: name.as_bytes().to_vec(),
                flags: ImportLibraryFlags::MachO {
                    ordinal,
                    cmd,
                    current_version: macho::Version::new(1, 0, 0),
                    compatibility_version: macho::Version::new(1, 0, 0),
                    use_flags: None,
                },
                command: None,
            },
        )
    }
    fn alias(&mut self, suffix: &str, target: &str) -> EntryId {
        let entry = self.entry(&format!("{}{suffix}", self.root), EntryKind::Alias);
        self.relation(
            entry,
            None,
            Evidence::Alias {
                stored_target: target.into(),
            },
        );
        entry
    }
    fn finish(self) -> Inventory {
        Inventory::new(
            self.id,
            self.root,
            self.entries,
            self.images,
            self.relationships,
        )
        .expect("authored fixture inventory must be valid")
    }
}
fn context(
    id: &'static str,
    label: &'static str,
    architecture: CpuIdentity,
    executable: ImageId,
    runpaths: Vec<Runpath>,
) -> FixtureContext {
    FixtureContext {
        id,
        label,
        context: ResolutionContext {
            architecture,
            executable: Some(executable),
            runpaths,
        },
    }
}

fn atlas() -> Dataset {
    let mut b = Builder::new(1, "/Atlas.app");
    b.file("/Contents/Info.plist");
    let main = b.file("/Contents/MacOS/Atlas");
    let example = b.file("/Contents/Frameworks/Example.framework/Versions/A/Example");
    b.alias(
        "/Contents/Frameworks/Example.framework/Versions/Current",
        "A",
    );
    b.alias(
        "/Contents/Frameworks/Example.framework/Example",
        "Versions/Current/Example",
    );
    let helper = b.file("/Contents/Helpers/Render Helper.app/Contents/MacOS/Render Helper");
    let telemetry = b.file("/Contents/Frameworks/libTelemetry.dylib");
    b.file("/Contents/Frameworks/Example.framework/Versions/A/Resources/Info.plist");
    b.file("/Contents/Resources/Settings.plist");
    let framework_base = b.directory("/Contents/Frameworks/Example.framework/Versions/A");
    let contents_base = b.directory("/Contents");
    let mut main_byte_facts = FileByteFacts {
        entry: main,
        byte_length: 409_600,
        image_ranges: Vec::new(),
    };
    let mut example_byte_facts = FileByteFacts {
        entry: example,
        byte_length: 655_360,
        image_ranges: Vec::new(),
    };
    let mut helper_byte_facts = FileByteFacts {
        entry: helper,
        byte_length: 196_608,
        image_ranges: Vec::new(),
    };
    let mut contexts = Vec::new();
    for (id, label, cpu) in [
        ("arm64", "arm64 · Atlas executable", arm64()),
        ("x86_64", "x86_64 · Atlas executable", x86_64()),
    ] {
        let main_image = b.image(main, cpu);
        let example_image = b.image(example, cpu);
        let helper_image = b.image(helper, cpu);
        b.image(telemetry, cpu);
        let (main_offset, example_offset, example_size, helper_offset, helper_size) =
            if cpu == arm64() {
                (16_384, 16_384, 376_832, 16_384, 81_920)
            } else {
                (212_992, 409_600, 245_760, 98_304, 98_304)
            };
        let main_range = image_byte_range(main_image, main_offset, 196_608);
        let example_range = image_byte_range(example_image, example_offset, example_size);
        let helper_range = image_byte_range(helper_image, helper_offset, helper_size);
        main_byte_facts.image_ranges.push(main_range);
        example_byte_facts.image_ranges.push(example_range);
        helper_byte_facts.image_ranges.push(helper_range);
        b.dependency(
            main_image,
            "@rpath/Example.framework/Example",
            macho::LC_LOAD_DYLIB,
        );
        b.dependency(
            helper_image,
            "@executable_path/../Frameworks/Example.framework/Example",
            macho::LC_LOAD_DYLIB,
        );
        b.dependency(
            example_image,
            "@rpath/libTelemetry.dylib",
            macho::LC_LOAD_DYLIB,
        );
        b.dependency(
            example_image,
            "/usr/lib/libSystem.B.dylib",
            macho::LC_LOAD_DYLIB,
        );
        b.dependency(
            example_image,
            "@rpath/Optional.dylib",
            macho::LC_LOAD_WEAK_DYLIB,
        );
        contexts.push(context(
            id,
            label,
            cpu,
            main_image,
            vec![Runpath {
                path: "@executable_path/../Frameworks".into(),
                owner: main_image,
            }],
        ));
    }
    b.relation(
        example,
        None,
        Evidence::ResourcePath {
            path: "Resources/Info.plist".into(),
            base: framework_base,
        },
    );
    b.relation(
        example,
        None,
        Evidence::ResourceString {
            value: "Resources/Settings.plist".into(),
            base: contents_base,
        },
    );
    Dataset {
        id: "atlas",
        label: "Atlas framework",
        description: "Versioned framework aliases, nested helper, resources and external/weak references. All facts are synthetic.",
        inventory: b.finish(),
        file_byte_facts: vec![main_byte_facts, example_byte_facts, helper_byte_facts],
        contexts,
        initial_entry: example,
    }
}

fn ambiguity() -> Dataset {
    let mut b = Builder::new(2, "/Ambiguity.app");
    let main = b.file("/Contents/MacOS/Atlas");
    let loader = b.file("/Contents/Helpers/Nested/Loader");
    let one = b.file("/Contents/Frameworks/One/libShared.dylib");
    let two = b.file("/Contents/Frameworks/Two/libShared.dylib");
    let special = b.file("/Contents/Frameworks/Special/libShared.dylib");
    let special_image = b.image(
        special,
        CpuIdentity {
            cpu_type: macho::CPU_TYPE_ARM64,
            cpu_subtype: macho::CPU_SUBTYPE_ARM64E.into(),
        },
    );
    let special_range = image_byte_range(special_image, 0, 131_072);
    let mut partial_byte_facts = FileByteFacts {
        entry: one,
        byte_length: 245_760,
        image_ranges: Vec::new(),
    };
    let mut contexts = Vec::new();
    for (id, label, cpu) in [
        ("arm64", "arm64 · multiple candidates", arm64()),
        ("x86_64", "x86_64 · one candidate", x86_64()),
    ] {
        let main_image = b.image(main, cpu);
        let loader_image = b.image(loader, cpu);
        let one_image = b.image(one, cpu);
        if cpu == arm64() {
            b.image(two, cpu);
            let recorded_range = image_byte_range(one_image, 8_192, 81_920);
            partial_byte_facts.image_ranges.push(recorded_range);
        }
        let reexport = b.dependency(main_image, "@rpath/libShared.dylib", macho::LC_LOAD_DYLIB);
        if let Evidence::Dependency {
            flags: ImportLibraryFlags::MachO { use_flags, .. },
            ..
        } = &mut b
            .relationships
            .iter_mut()
            .find(|relation| relation.id == reexport)
            .unwrap()
            .evidence
        {
            *use_flags = Some(macho::DYLIB_USE_REEXPORT);
        }
        if cpu == arm64() {
            b.dependency(
                main_image,
                "@loader_path/../Frameworks/One/libShared.dylib",
                macho::LC_LOAD_DYLIB,
            );
            b.dependency(one_image, "@executable_path/Atlas", macho::LC_LOAD_DYLIB);
        }
        contexts.push(context(
            id,
            label,
            cpu,
            main_image,
            vec![
                Runpath {
                    path: "@loader_path/../../Frameworks/Two".into(),
                    owner: loader_image,
                },
                Runpath {
                    path: "@loader_path/../Frameworks/Missing".into(),
                    owner: main_image,
                },
                Runpath {
                    path: "@loader_path/../Frameworks/One".into(),
                    owner: main_image,
                },
                Runpath {
                    path: "@loader_path/../Frameworks/Special".into(),
                    owner: main_image,
                },
            ],
        ));
    }
    Dataset {
        id: "ambiguity",
        label: "Ambiguity & architectures",
        description: "Ordered runpaths keep declaring-image context, duplicate names and exact CPU mismatches explicit. No loader choice is claimed.",
        inventory: b.finish(),
        file_byte_facts: vec![
            FileByteFacts {
                entry: special,
                byte_length: 131_072,
                image_ranges: vec![special_range],
            },
            partial_byte_facts,
        ],
        contexts,
        initial_entry: main,
    }
}

fn incomplete() -> Dataset {
    let mut b = Builder::new(3, "/Incomplete.app");
    let main = b.file("/Contents/MacOS/Atlas");
    let image = b.image(main, arm64());
    let suggest = b.file("/Contents/Frameworks/libSuggested.dylib");
    b.image(suggest, arm64());
    b.alias("/Contents/Frameworks/Broken", "Missing.dylib");
    b.alias("/Contents/Frameworks/CycleA", "CycleB");
    b.alias("/Contents/Frameworks/CycleB", "CycleA");
    b.alias(
        "/Contents/Frameworks/Outside",
        "/Library/Frameworks/Outside.framework/Outside",
    );
    b.dependency(image, "@rpath/Broken", macho::LC_LOAD_DYLIB);
    b.dependency(image, "@rpath/CycleA", macho::LC_LOAD_DYLIB);
    b.dependency(image, "@rpath/Outside", macho::LC_LOAD_DYLIB);
    let external = b.dependency(image, "/usr/lib/libSuggested.dylib", macho::LC_LOAD_DYLIB);
    b.relationships
        .iter_mut()
        .find(|relation| relation.id == external)
        .unwrap()
        .suggested_entry = Some(suggest);
    b.dependency(image, "@unknown/libMystery.dylib", macho::LC_LOAD_DYLIB);
    b.dependency(image, "@rpath/Optional.dylib", macho::LC_LOAD_WEAK_DYLIB);
    let contexts = vec![context(
        "arm64",
        "arm64 · bounded incomplete inventory",
        arm64(),
        image,
        vec![Runpath {
            path: "@loader_path/../Frameworks".into(),
            owner: image,
        }],
    )];
    Dataset {
        id: "incomplete",
        label: "Incomplete evidence",
        description: "Broken/cyclic aliases, an external alias, missing weak library and a suggestion that never becomes a target.",
        inventory: b.finish(),
        file_byte_facts: vec![FileByteFacts {
            entry: main,
            byte_length: 65_536,
            image_ranges: Vec::new(),
        }],
        contexts,
        initial_entry: main,
    }
}

fn dense() -> Dataset {
    let mut b = Builder::new(4, "/Dense.app");
    let main = b.file("/Contents/MacOS/Atlas");
    let image = b.image(main, arm64());
    let main_range = image_byte_range(image, 0, 196_608);
    let mut file_byte_facts = vec![FileByteFacts {
        entry: main,
        byte_length: 196_608,
        image_ranges: vec![main_range],
    }];
    for group in 0..3 {
        for index in 0..80 {
            b.file(&format!(
                "/Contents/Frameworks/Group{group}/Unrelated{index:03}.dat"
            ));
        }
    }
    for index in 0..18 {
        let file = b.file(&format!(
            "/Contents/Frameworks/Group{}/libModule{index:02}.dylib",
            index % 3
        ));
        let library = b.image(file, arm64());
        let library_range = image_byte_range(library, 4_096, 61_440);
        file_byte_facts.push(FileByteFacts {
            entry: file,
            byte_length: 65_536,
            image_ranges: vec![library_range],
        });
        b.dependency(
            image,
            &format!(
                "@executable_path/../Frameworks/Group{}/libModule{index:02}.dylib",
                index % 3
            ),
            macho::LC_LOAD_DYLIB,
        );
        b.dependency(library, "/usr/lib/libSystem.B.dylib", macho::LC_LOAD_DYLIB);
        if index > 0 {
            b.dependency(
                library,
                &format!(
                    "@loader_path/../Group{}/libModule{:02}.dylib",
                    (index - 1) % 3,
                    index - 1
                ),
                macho::LC_LOAD_DYLIB,
            );
        }
    }
    let resource_base = b.directory("/Contents/Resources");
    let long_resource = "Localization/RegionalOverrides/DevelopmentAndDiagnostics/VeryLongResourceDirectoryName/AnotherDeliberatelyLongNestedDirectory/SettingsAndFeatureOverrides.plist";
    b.file(&format!("/Contents/Resources/{long_resource}"));
    b.relation(
        main,
        None,
        Evidence::ResourcePath {
            path: long_resource.into(),
            base: resource_base,
        },
    );
    let contexts = vec![context(
        "arm64",
        "arm64 · dense direct neighborhood",
        arm64(),
        image,
        Vec::new(),
    )];
    Dataset {
        id: "dense",
        label: "Dense neighborhood",
        description: "Eighteen libraries after 240 unrelated rows and one long resource path exercise virtualized scrolling and direct endpoint activation.",
        inventory: b.finish(),
        file_byte_facts,
        contexts,
        initial_entry: main,
    }
}
