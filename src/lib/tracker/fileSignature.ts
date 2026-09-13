// Place at: src/lib/tracker/fileSignature.ts
//
// A browser-supplied Content-Type is just a claim, not a fact about the
// bytes - nothing upstream of this ever confirms a file uploaded as
// "application/pdf" actually starts with real PDF bytes before those
// bytes get handed to a real parser (pdf-lib/sharp, in the Vault's
// watermarking path). A minimal magic-byte check closes that gap without
// a new dependency - these four signatures are simple, stable, and
// well-documented file formats.
export type SniffableFileType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

// Plain fixed-offset prefixes for the three formats that are just a
// contiguous magic number at byte 0. WEBP isn't - it's a RIFF container
// (4-byte "RIFF", then a 4-byte length nothing here cares about, then
// "WEBP") - so it's checked separately in matchesDeclaredFileType below
// rather than forcing it into this same shape.
const SIGNATURES: Record<Exclude<SniffableFileType, "image/webp">, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

function bytesStartWith(bytes: Buffer, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

export function matchesDeclaredFileType(bytes: Buffer, declaredType: SniffableFileType): boolean {
  if (declaredType === "image/webp") {
    return (
      bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
      bytesStartWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // "WEBP" at offset 8
    );
  }
  return bytesStartWith(bytes, SIGNATURES[declaredType]);
}
