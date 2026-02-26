import { describe, it, expect } from "vitest";
import { isBinaryByMagicBytes, containsNullBytes } from "./binaryDetection";

// Helper to create a Uint8Array from hex bytes + optional padding
function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("isBinaryByMagicBytes", () => {
  it("detects PNG", () => {
    expect(isBinaryByMagicBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
  });

  it("detects JPEG", () => {
    expect(isBinaryByMagicBytes(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
  });

  it("detects GIF", () => {
    expect(isBinaryByMagicBytes(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe(true);
  });

  it("detects ZIP", () => {
    expect(isBinaryByMagicBytes(bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true);
  });

  it("detects ZIP (empty archive)", () => {
    expect(isBinaryByMagicBytes(bytes(0x50, 0x4b, 0x05, 0x06))).toBe(true);
  });

  it("detects GZIP", () => {
    expect(isBinaryByMagicBytes(bytes(0x1f, 0x8b, 0x08))).toBe(true);
  });

  it("detects PDF", () => {
    expect(isBinaryByMagicBytes(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe(true);
  });

  it("detects ELF", () => {
    expect(isBinaryByMagicBytes(bytes(0x7f, 0x45, 0x4c, 0x46))).toBe(true);
  });

  it("detects PE/MZ (Windows executable)", () => {
    expect(isBinaryByMagicBytes(bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(true);
  });

  it("detects Mach-O (64-bit)", () => {
    expect(isBinaryByMagicBytes(bytes(0xcf, 0xfa, 0xed, 0xfe))).toBe(true);
  });

  it("detects WebAssembly", () => {
    expect(isBinaryByMagicBytes(bytes(0x00, 0x61, 0x73, 0x6d))).toBe(true);
  });

  it("detects WEBP (RIFF....WEBP)", () => {
    // RIFF + 4 bytes size + WEBP
    const buf = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
    expect(isBinaryByMagicBytes(buf)).toBe(true);
  });

  it("detects WAV (RIFF....WAVE)", () => {
    const buf = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
    expect(isBinaryByMagicBytes(buf)).toBe(true);
  });

  it("detects MP4 (ftyp at offset 4)", () => {
    const buf = bytes(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70);
    expect(isBinaryByMagicBytes(buf)).toBe(true);
  });

  it("detects RAR", () => {
    expect(isBinaryByMagicBytes(bytes(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07))).toBe(true);
  });

  it("detects 7z", () => {
    expect(isBinaryByMagicBytes(bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c))).toBe(true);
  });

  it("returns false for plain text", () => {
    const text = new TextEncoder().encode("# Hello World\nThis is markdown.");
    expect(isBinaryByMagicBytes(text)).toBe(false);
  });

  it("returns false for JSON", () => {
    const text = new TextEncoder().encode('{"key": "value"}');
    expect(isBinaryByMagicBytes(text)).toBe(false);
  });

  it("returns false for empty buffer", () => {
    expect(isBinaryByMagicBytes(new Uint8Array(0))).toBe(false);
  });

  it("returns false for buffer shorter than any signature", () => {
    expect(isBinaryByMagicBytes(bytes(0x50))).toBe(false);
  });
});

describe("containsNullBytes", () => {
  it("returns false for plain text", () => {
    const text = new TextEncoder().encode("Hello, world!");
    expect(containsNullBytes(text)).toBe(false);
  });

  it("returns true when null byte present", () => {
    const buf = bytes(0x48, 0x65, 0x6c, 0x00, 0x6f);
    expect(containsNullBytes(buf)).toBe(true);
  });

  it("returns true for null byte at start", () => {
    expect(containsNullBytes(bytes(0x00, 0x41, 0x42))).toBe(true);
  });

  it("returns false for empty buffer", () => {
    expect(containsNullBytes(new Uint8Array(0))).toBe(false);
  });

  it("respects the limit parameter", () => {
    // Null byte at position 5, limit at 3 — should not be detected
    const buf = bytes(0x41, 0x42, 0x43, 0x44, 0x45, 0x00);
    expect(containsNullBytes(buf, 3)).toBe(false);
    // But with a larger limit, it is detected
    expect(containsNullBytes(buf, 6)).toBe(true);
  });

  it("handles buffer smaller than limit", () => {
    const text = new TextEncoder().encode("short");
    expect(containsNullBytes(text, 8192)).toBe(false);
  });
});
