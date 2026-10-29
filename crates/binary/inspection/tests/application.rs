//! Application input policy, separate from filesystem acquisition and binary decoding.

use binary_inspection::{
    ApplicationBundleRootError as Error, ApplicationBundleRootFacts as Facts,
    validate_application_bundle_root,
};

#[test]
fn one_modern_app_root_is_required_without_claiming_metadata_validity() {
    let modern = Facts {
        is_directory: true,
        contents_is_directory: true,
        info_plist_is_file: true,
    };
    assert_eq!(
        validate_application_bundle_root(b"Chosen.app", modern),
        Ok(())
    );
    // A native name need not be UTF-8; only its exact suffix controls this policy.
    assert_eq!(
        validate_application_bundle_root(b"\xff.app", modern),
        Ok(())
    );
    for (name, facts, expected) in [
        (
            b"Applications".as_slice(),
            modern,
            Error::NotApplicationName,
        ),
        (
            b"Chosen.app".as_slice(),
            Facts {
                is_directory: false,
                ..modern
            },
            Error::NotDirectory,
        ),
        (
            b"Chosen.app".as_slice(),
            Facts {
                contents_is_directory: false,
                ..modern
            },
            Error::MissingContents,
        ),
        (
            b"Chosen.app".as_slice(),
            Facts {
                info_plist_is_file: false,
                ..modern
            },
            Error::MissingInfoPlist,
        ),
    ] {
        assert_eq!(validate_application_bundle_root(name, facts), Err(expected));
    }
}
