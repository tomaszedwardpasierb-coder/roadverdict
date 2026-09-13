// Place at: src/lib/tracker/fileSignature.ts
//
// A browser-supplied Content-Type is just a claim, not a fact about the
// bytes - nothing upstream of this ever confirms a file uploaded as
// "application/pdf" actually starts with real PDF bytes before those
// bytes get handed to a real parser (pdf-lib/sharp, in the Vault's
// watermarking path). A minimal magic-byte check closes that gap without
// a new dependency - these three signatures are simple, stable, and
// well-documented file formats.
export type SniffableFileType = "application/pdf" | "image/jpeg" | "image/png";

const SIGNATURES: Record<SniffableFileType, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export function matchesDeclaredFileType(bytes: Buffer, declaredType: SniffableFileType): boolean {
  const signature = SIGNATURES[declaredType];
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}
