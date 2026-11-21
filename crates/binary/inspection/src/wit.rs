//! Contract representations of `object`'s types, compiled only with `wit`.
//!
//! Reports expose `object` values directly. No derive can be placed on another
//! crate's type, so each representation is stated once here and referenced by
//! a rule on the field that holds the value. Native callers never see these
//! types; they exist for the generated component contract.

use object::{Wrap, macho};
use wit_reflect::WitType;

use crate::{CpuIdentity, PlatformDeclaration};

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

impl From<macho::CpuType> for MachoValue {
    fn from(cpu_type: macho::CpuType) -> Self {
        Self::new(cpu_type.into_inner(), cpu_type.name())
    }
}

impl From<macho::FileType> for MachoValue {
    fn from(file_type: macho::FileType) -> Self {
        Self::new(file_type.into_inner(), file_type.name())
    }
}

impl From<macho::LoadCommandType> for MachoValue {
    fn from(command: macho::LoadCommandType) -> Self {
        Self::new(command.into_inner(), command.name())
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

impl PlatformDeclaration {
    /// The platform identifier, present for `LC_BUILD_VERSION`.
    ///
    /// Legacy commands have no platform field; `source.kind` retains their identity.
    pub(crate) fn platform_value(&self) -> Option<MachoValue> {
        self.platform
            .map(|platform| MachoValue::new(platform.into_inner(), platform.name()))
    }
}
