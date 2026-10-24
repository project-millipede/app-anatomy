//! Unified parser entry points share resident and source acquisition behavior.

use std::{
    error::Error,
    fs, io,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use binary_inspection::{
    ErrorKind, InspectionError,
    input::{ByteSource, InputError, SourceError},
    inspect_object, inspect_object_source,
};
use object::{
    BinaryFormat,
    read::{
        coff::CoffHeader,
        pe::{ImageNtHeaders, PeFile64},
    },
};
use test_assets_ureq::{TestAssetDef, dl_test_files};

/// Prepare pinned upstream fixtures once for this test process, then read the requested bytes.
fn fixture_bytes(path: &str) -> Vec<u8> {
    // Both tests use the PE fixture; initialize its disk cache before either reads it.
    static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();
    let directory = DIRECTORY.get_or_init(|| {
        let revision = "fe8da208d4013ec3691311915fdc7d71436c0d1e";
        let base_url =
            format!("https://raw.githubusercontent.com/gimli-rs/object-testfiles/{revision}");
        let assets = [
            (
                "elf/base.o",
                "a361b3588b8b8cf1b1d9a47a48498b011ce5a72bd2a8170da417718c7d727b25",
            ),
            (
                "macho/base-aarch64.o",
                "11927e782b4d644b8cf81ee7db3242a707e55f46ad5827b3e48e0dc6ef2fae90",
            ),
            (
                "pe/base-gnu.exe",
                "513001c978f9b1c492d11b0d3f3c0346f98acbe711072e4b910e1d97c9711102",
            ),
        ]
        .map(|(filepath, hash)| TestAssetDef {
            filepath: filepath.to_owned(),
            hash: hash.to_owned(),
            url: format!("{base_url}/{filepath}"),
        });
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/object-testfiles");
        dl_test_files(
            &assets,
            directory
                .to_str()
                .expect("fixture cache path must be UTF-8"),
        )
        .expect("upstream fixtures must download and match their SHA-256 hashes");
        directory
    });
    fs::read(directory.join(path)).expect("verified upstream fixture must be readable")
}

// TODO: Check representative report fields against known fixture values as well
// as comparing input paths, so a shared conversion bug cannot pass both paths.
#[test]
fn unified_reports_and_decode_causes_agree_for_resident_and_source_input() {
    for (path, format) in [
        ("elf/base.o", BinaryFormat::Elf),
        ("macho/base-aarch64.o", BinaryFormat::MachO),
        ("pe/base-gnu.exe", BinaryFormat::Pe),
    ] {
        let bytes = fixture_bytes(path);
        let report = inspect_object(&bytes).unwrap();
        assert_eq!(report.format, format);
        let mut source = bytes.as_slice();
        assert_eq!(report, inspect_object_source(&mut source).unwrap());

        let truncated = &bytes[..16];
        let error = inspect_object(truncated).unwrap_err();
        assert!(matches!(error.kind, ErrorKind::Decode(_)));
        assert!(error.source().unwrap().is::<object::Error>());
        let mut source = truncated;
        let InspectionError::Analysis(source_error) =
            inspect_object_source(&mut source).unwrap_err()
        else {
            panic!("decode failure was not preserved");
        };
        assert_eq!(source_error, error);
    }
}

#[test]
fn an_optional_pe_read_cannot_hide_an_acquisition_failure() {
    struct UnavailableSymbols {
        bytes: Vec<u8>,
        symbols_offset: u64,
    }

    impl ByteSource for UnavailableSymbols {
        fn byte_length(&self) -> u64 {
            self.bytes.len() as u64
        }

        fn read_at(&mut self, offset: u64, destination: &mut [u8]) -> Result<usize, SourceError> {
            if offset >= self.symbols_offset {
                return Err(io::Error::from(io::ErrorKind::PermissionDenied).into());
            }
            self.bytes.as_slice().read_at(offset, destination)
        }
    }

    let bytes = fixture_bytes("pe/base-gnu.exe");
    let file = PeFile64::parse(bytes.as_slice()).unwrap();
    let symbols_offset = u64::from(file.nt_headers().file_header().pointer_to_symbol_table());
    assert_ne!(symbols_offset, 0);

    // `object` tolerates unavailable COFF symbols; our source error must still reach the caller.
    let error = inspect_object_source(&mut UnavailableSymbols {
        bytes,
        symbols_offset,
    })
    .unwrap_err();
    let InspectionError::Input(InputError::Source {
        error: SourceError::Io(cause),
        ..
    }) = error
    else {
        panic!("the acquisition failure was hidden: {error}");
    };
    assert_eq!(cause.kind(), io::ErrorKind::PermissionDenied);
}
