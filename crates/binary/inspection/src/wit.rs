//! Contract representations of other crates' types, compiled only with `wit`.
//!
//! Reports expose `object` values directly. No derive can be placed on another
//! crate's type, so [`Representations`] states once how each one is shown. The
//! crate's `Cargo.toml` names that map, and every derive of the crate looks
//! its fields up in it; a field of a listed type carries no rule. Native
//! callers never see these types; they exist for the generated component
//! contract.

use object::Wrap;
use wit_reflect::WitType;
use wit_reflect::rule::DisplayText;

use crate::CpuIdentity;

wit_reflect::representations! {
    /// The contract's form of each type of another crate that the reports and
    /// their errors hold.
    pub Representations {
        object {
            object::Endianness => Endianness,
            // One conversion for the wrapped numbers. They share the functions
            // it calls, not a trait, so it is expanded for each of them.
            object::macho::CpuType
            | object::macho::LoadCommandType
            | object::macho::FileType
            | object::macho::Platform => MachoValue
                with |value| MachoValue::new(value.into_inner(), value.name()),
            object::macho::Version => DisplayText,
            object::Error => DisplayText,
        }
        std {
            std::io::Error => DisplayText,
            std::boxed::Box<dyn std::error::Error + Send + Sync> => DisplayText,
        }
    }
}

/// Byte order of a header or image.
// The derive checks this declaration against `object::Endianness`: if upstream
// adds a case, the generated conversion stops compiling.
#[derive(WitType)]
#[wit(remote = object::Endianness)]
pub enum Endianness {
    /// Little endian byte order.
    Little,
    /// Big endian byte order.
    Big,
}

/// Numeric Mach-O evidence with an optional canonical name from object.
///
/// A missing name preserves the value without guessing its meaning.
#[derive(WitType)]
pub struct MachoValue {
    /// The raw value exactly as stored in the binary.
    pub value: u32,
    /// The upstream constant name, when the value is a recognized one.
    pub name: Option<String>,
}

impl MachoValue {
    fn new(value: u32, name: Option<&str>) -> Self {
        Self {
            value,
            name: name.map(str::to_owned),
        }
    }
}

impl CpuIdentity {
    /// The subtype's complete bit pattern with its name for this CPU family.
    ///
    /// The name identifies only the CPU-specific subtype and excludes capability
    /// bits, which remain in the value. It depends on the sibling CPU type.
    pub(crate) fn subtype_value(&self) -> MachoValue {
        MachoValue::new(self.cpu_subtype.into_inner(), self.subtype_name())
    }
}
