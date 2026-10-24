//! Small, independent encoders for specification-shaped parser test inputs.
//!
//! These fixtures contain headers and load commands, not executable programs.
//! Numeric fields follow Apple's `mach-o/loader.h` and `mach-o/fat.h`; the
//! encoders deliberately do not depend on the parser's implementation helpers.

#![allow(dead_code)]

pub const CPU_ARM64: u32 = 0x0100_000c;

pub const LC_CODE_SIGNATURE: u32 = 0x1d;

#[derive(Clone, Copy, Debug)]
pub enum ByteOrder {
    Little,
    Big,
}

impl ByteOrder {
    pub fn write_u32(self, bytes: &mut [u8], offset: usize, value: u32) {
        let encoded = match self {
            Self::Little => value.to_le_bytes(),
            Self::Big => value.to_be_bytes(),
        };
        bytes[offset..offset + 4].copy_from_slice(&encoded);
    }

    pub fn write_u64(self, bytes: &mut [u8], offset: usize, value: u64) {
        let encoded = match self {
            Self::Little => value.to_le_bytes(),
            Self::Big => value.to_be_bytes(),
        };
        bytes[offset..offset + 8].copy_from_slice(&encoded);
    }
}

#[derive(Clone, Copy, Debug)]
pub enum HeaderFormat {
    Bits32,
    Bits64,
}

impl HeaderFormat {
    pub fn size(self) -> usize {
        match self {
            Self::Bits32 => 28,
            Self::Bits64 => 32,
        }
    }

    fn magic(self) -> u32 {
        match self {
            Self::Bits32 => 0xfeed_face,
            Self::Bits64 => 0xfeed_facf,
        }
    }
}

/// A complete minimal Mach-O header followed by explicitly supplied commands.
pub struct MachOFixture {
    pub order: ByteOrder,
    pub format: HeaderFormat,
    pub cpu_type: u32,
    pub cpu_subtype: u32,
    pub file_type: u32,
    pub flags: u32,
    pub commands: Vec<Vec<u8>>,
}

impl Default for MachOFixture {
    fn default() -> Self {
        Self {
            order: ByteOrder::Little,
            format: HeaderFormat::Bits64,
            cpu_type: CPU_ARM64,
            cpu_subtype: 0,
            file_type: 2,
            flags: 0,
            commands: Vec::new(),
        }
    }
}

impl MachOFixture {
    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = vec![0; self.format.size()];
        self.order.write_u32(&mut bytes, 0, self.format.magic());
        self.order.write_u32(&mut bytes, 4, self.cpu_type);
        self.order.write_u32(&mut bytes, 8, self.cpu_subtype);
        self.order.write_u32(&mut bytes, 12, self.file_type);
        self.order
            .write_u32(&mut bytes, 16, self.commands.len() as u32);
        let commands_size: usize = self.commands.iter().map(Vec::len).sum();
        self.order.write_u32(&mut bytes, 20, commands_size as u32);
        self.order.write_u32(&mut bytes, 24, self.flags);
        for command in &self.commands {
            bytes.extend_from_slice(command);
        }
        bytes
    }
}

/// Encode one `load_command` envelope, leaving any payload zero-filled.
pub fn command(order: ByteOrder, command_type: u32, size: usize) -> Vec<u8> {
    assert!(size >= 8, "test command must have room for its envelope");
    let mut bytes = vec![0; size];
    order.write_u32(&mut bytes, 0, command_type);
    order.write_u32(&mut bytes, 4, size as u32);
    bytes
}

pub fn code_signature(order: ByteOrder, offset: u32, length: u32) -> Vec<u8> {
    let mut bytes = command(order, LC_CODE_SIGNATURE, 16);
    order.write_u32(&mut bytes, 8, offset);
    order.write_u32(&mut bytes, 12, length);
    bytes
}

#[derive(Clone, Copy, Debug)]
pub enum UniversalFormat {
    Fat32,
    Fat64,
}

impl UniversalFormat {
    pub fn entry_size(self) -> usize {
        match self {
            Self::Fat32 => 20,
            Self::Fat64 => 32,
        }
    }

    fn magic(self) -> u32 {
        match self {
            Self::Fat32 => 0xcafe_babe,
            Self::Fat64 => 0xcafe_babf,
        }
    }
}

pub struct UniversalMember<'a> {
    pub cpu_type: u32,
    pub cpu_subtype: u32,
    pub image: &'a [u8],
}

/// Encode members with eight-byte alignment and return their file offsets.
/// The returned offsets make coordinate assertions explicit without reparsing
/// the generated table in tests.
pub fn universal(
    format: UniversalFormat,
    order: ByteOrder,
    members: &[UniversalMember<'_>],
) -> (Vec<u8>, Vec<usize>) {
    let mut bytes = vec![0; 8 + members.len() * format.entry_size()];
    order.write_u32(&mut bytes, 0, format.magic());
    order.write_u32(&mut bytes, 4, members.len() as u32);
    let mut offsets = Vec::new();
    for (index, member) in members.iter().enumerate() {
        let offset = (bytes.len() + 7) & !7;
        bytes.resize(offset, 0);
        bytes.extend_from_slice(member.image);
        offsets.push(offset);
        let entry = 8 + index * format.entry_size();
        order.write_u32(&mut bytes, entry, member.cpu_type);
        order.write_u32(&mut bytes, entry + 4, member.cpu_subtype);
        match format {
            UniversalFormat::Fat32 => {
                order.write_u32(&mut bytes, entry + 8, offset as u32);
                order.write_u32(&mut bytes, entry + 12, member.image.len() as u32);
                order.write_u32(&mut bytes, entry + 16, 3);
            }
            UniversalFormat::Fat64 => {
                order.write_u64(&mut bytes, entry + 8, offset as u64);
                order.write_u64(&mut bytes, entry + 16, member.image.len() as u64);
                order.write_u32(&mut bytes, entry + 24, 3);
            }
        }
    }
    (bytes, offsets)
}
