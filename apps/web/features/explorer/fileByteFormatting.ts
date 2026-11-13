/**
 * Format a byte length in readable binary units without changing the recorded value.
 * @param byteLength Exact, nonnegative file or region length supplied by Rust.
 * @returns A compact size label; exact byte values remain available alongside it.
 */
export function formatFileByteSize(byteLength: number): string {
  if (byteLength < 1024) return formatByteCount(byteLength);

  let size = byteLength;
  for (const unit of ['KiB', 'MiB', 'GiB', 'TiB', 'PiB']) {
    size /= 1024;
    if (size < 1024 || unit === 'PiB') {
      return `${size.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;
    }
  }
  return formatByteCount(byteLength);
}

/**
 * Display an exact exported byte length without rounding.
 * @param byteLength Byte count within JavaScript's exact integer range.
 * @returns The grouped decimal value with its unit.
 */
export function formatByteCount(byteLength: number): string {
  return `${byteLength.toLocaleString('en-US')} ${byteLength === 1 ? 'byte' : 'bytes'}`;
}

/**
 * Format a file offset or exclusive range end.
 * @param offset Exact byte coordinate supplied by Rust.
 * @returns A hexadecimal coordinate prefixed with 0x.
 */
export function formatFileOffset(offset: number): string {
  return `0x${offset.toString(16).toUpperCase()}`;
}
