//! Application grouping of upstream associations, independent of binary parsing.

use binary_inspection::{DeclaredLibrary, DependencyEvidence, ImportedSymbol};
use object::{
    Wrap, macho,
    read::{ImportFlags, ImportLibraryFlags},
};

fn declaration(ordinal: u32) -> DeclaredLibrary {
    DeclaredLibrary {
        name: b"same-name.dylib".to_vec(),
        flags: ImportLibraryFlags::MachO {
            ordinal,
            cmd: macho::LC_LOAD_DYLIB,
            current_version: macho::Version::new(1, 0, 0),
            compatibility_version: macho::Version::new(1, 0, 0),
            use_flags: None,
        },
    }
}

fn symbol(flags: ImportFlags<'static>) -> ImportedSymbol {
    ImportedSymbol {
        name: b"_symbol".to_vec(),
        library: b"same-name.dylib".to_vec(),
        weak: false,
        flags,
    }
}

fn symbol_table(ordinal: u8) -> ImportFlags<'static> {
    ImportFlags::MachO {
        n_type: macho::SymbolFlags::from_inner(1),
        n_desc: macho::SymbolDesc::from_inner(0)
            .with_library(macho::SymbolLibrary::from_inner(ordinal)),
    }
}

fn bind(ordinal: i32) -> ImportFlags<'static> {
    ImportFlags::MachOBind {
        dylib: macho::BindDylib::from_inner(ordinal),
        flags: macho::BindSymbolFlags::from_inner(0),
    }
}

#[test]
fn duplicate_names_stay_separate_and_special_or_missing_ordinals_stay_unassociated() {
    let evidence = DependencyEvidence {
        libraries: vec![declaration(1), declaration(2)],
        imports: vec![
            symbol(symbol_table(2)),
            symbol(bind(-2)),
            symbol(bind(1)),
            symbol(bind(3)),
            symbol(symbol_table(1)),
        ],
        runpaths: Vec::new(),
        install_names: Vec::new(),
    };
    let groups = evidence.group_imports(macho::MH_TWOLEVEL.into_inner());
    assert_eq!(groups.libraries, [vec![2, 4], vec![0]]);
    assert_eq!(groups.unassociated, [1, 3]);
}

#[test]
fn flat_symbol_metadata_does_not_create_an_ordinary_declaration_association() {
    let evidence = DependencyEvidence {
        libraries: vec![declaration(1)],
        imports: vec![symbol(symbol_table(1)), symbol(bind(1)), symbol(bind(0))],
        runpaths: Vec::new(),
        install_names: Vec::new(),
    };
    let groups = evidence.group_imports(0);
    assert_eq!(groups.libraries, [vec![1]]);
    assert_eq!(groups.unassociated, [0, 2]);
}
