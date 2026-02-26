/**
 * Known binary file signatures (magic bytes).
 * Each entry: [byte sequence, optional offset].
 */
const BINARY_SIGNATURES: Array<[number[], number?]> = [
  // Images
  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], // PNG
  [[0xff, 0xd8, 0xff]],                                  // JPEG
  [[0x47, 0x49, 0x46, 0x38]],                             // GIF
  [[0x42, 0x4d]],                                         // BMP
  [[0x00, 0x00, 0x01, 0x00]],                             // ICO
  [[0x49, 0x49, 0x2a, 0x00]],                             // TIFF (little-endian)
  [[0x4d, 0x4d, 0x00, 0x2a]],                             // TIFF (big-endian)
  // Archives
  [[0x50, 0x4b, 0x03, 0x04]],                             // ZIP / JAR / DOCX / etc.
  [[0x50, 0x4b, 0x05, 0x06]],                             // ZIP (empty archive)
  [[0x1f, 0x8b]],                                         // GZIP
  [[0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]],                 // RAR
  [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],                 // 7z
  // Documents
  [[0x25, 0x50, 0x44, 0x46]],                             // PDF
  // Executables
  [[0x7f, 0x45, 0x4c, 0x46]],                             // ELF
  [[0x4d, 0x5a]],                                         // PE / MZ (Windows .exe/.dll)
  [[0xcf, 0xfa, 0xed, 0xfe]],                             // Mach-O (64-bit)
  [[0xce, 0xfa, 0xed, 0xfe]],                             // Mach-O (32-bit)
  [[0xfe, 0xed, 0xfa, 0xcf]],                             // Mach-O (64-bit, big-endian)
  [[0xfe, 0xed, 0xfa, 0xce]],                             // Mach-O (32-bit, big-endian)
  [[0x00, 0x61, 0x73, 0x6d]],                             // WebAssembly
  // Audio / Video
  [[0x4f, 0x67, 0x67, 0x53]],                             // OGG
  [[0x49, 0x44, 0x33]],                                   // MP3 (ID3)
  [[0x66, 0x4c, 0x61, 0x43]],                             // FLAC
  // Database
  [[0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
    0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00]],    // SQLite
];

function matchesSignature(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Layer 2: Detect known binary file formats via magic bytes.
 * Returns true if the buffer matches any known binary signature.
 */
export function isBinaryByMagicBytes(buffer: Uint8Array): boolean {
  for (const [sig, offset] of BINARY_SIGNATURES) {
    if (matchesSignature(buffer, sig, offset ?? 0)) return true;
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46], 0) &&
    matchesSignature(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return true;
  }

  // WAV: RIFF....WAVE
  if (
    buffer.length >= 12 &&
    matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46], 0) &&
    matchesSignature(buffer, [0x57, 0x41, 0x56, 0x45], 8)
  ) {
    return true;
  }

  // MP4/MOV: "ftyp" at offset 4
  if (buffer.length >= 8 && matchesSignature(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    return true;
  }

  return false;
}

/**
 * Layer 3: Heuristic null-byte scan over the first N bytes.
 * Text files (UTF-8, ASCII, etc.) should not contain 0x00 bytes.
 */
export function containsNullBytes(
  buffer: Uint8Array,
  limit: number = 8192,
): boolean {
  const end = Math.min(buffer.length, limit);
  for (let i = 0; i < end; i++) {
    if (buffer[i] === 0x00) return true;
  }
  return false;
}
