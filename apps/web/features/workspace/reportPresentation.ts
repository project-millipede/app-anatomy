import type {
  AnalysisScope,
  ContainerKind,
  CpuIdentity,
  Endianness,
  FileRange,
  HeaderFormat,
  MachoValue,
} from '@apple-code/browser';

// These tables render classifications already made in Rust. They never inspect bytes.
export const containerLabels: Record<ContainerKind, string> = {
  thin: 'Thin Mach-O',
  universal32: 'Universal Mach-O',
  universal64: 'Universal Mach-O (fat64)',
};

export const headerLabels: Record<HeaderFormat, string> = {
  'mach-o32': '32-bit Mach-O header',
  'mach-o64': '64-bit Mach-O header',
};

export const endiannessLabels: Record<Endianness, string> = {
  little: 'Little endian',
  big: 'Big endian',
};

export const scopeLabels: Record<AnalysisScope, string> = {
  'headers-only':
    'Header analysis only. Certificates, signature integrity, bundle resources and runtime acceptance have not been evaluated.',
};

/**
 * Display a Rust-supplied canonical name or preserve an unnamed numeric value.
 * @param field Numeric Mach-O evidence and its optional name.
 * @returns Canonical name, or a hexadecimal value when no name is available.
 */
export function machoValueLabel(field: MachoValue): string {
  return field.name ?? `0x${field.value.toString(16)}`;
}

/**
 * Keep CPU type and subtype visible when selecting an architecture slice.
 * @param cpu CPU identities supplied by Rust, including optional subtype names.
 * @returns CPU type and subtype labels without interpreting their numeric values.
 */
export function cpuLabel(cpu: CpuIdentity): string {
  return `${machoValueLabel(cpu.cpuType)} / ${machoValueLabel(cpu.cpuSubtype)}`;
}

export function rangeLabel(range: FileRange): string {
  return `${range.offset.toLocaleString()} – ${(range.offset + range.size).toLocaleString()}`;
}
