import { describe, expect, it } from "vitest";
import { matchesDeclaredFileType } from "@/lib/tracker/fileSignature";

describe("matchesDeclaredFileType", () => {
  it("accepts real PDF bytes as application/pdf", () => {
    const bytes = Buffer.from("%PDF-1.7\n%rest of file", "ascii");
    expect(matchesDeclaredFileType(bytes, "application/pdf")).toBe(true);
  });

  it("accepts real JPEG bytes as image/jpeg", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect(matchesDeclaredFileType(bytes, "image/jpeg")).toBe(true);
  });

  it("accepts real PNG bytes as image/png", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(matchesDeclaredFileType(bytes, "image/png")).toBe(true);
  });

  it("rejects a file whose real bytes don't match the declared type", () => {
    const bytes = Buffer.from("not actually a pdf at all", "ascii");
    expect(matchesDeclaredFileType(bytes, "application/pdf")).toBe(false);
  });

  it("rejects a JPEG's bytes when declared as a PDF", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(matchesDeclaredFileType(bytes, "application/pdf")).toBe(false);
  });

  it("rejects a file too short to contain the signature", () => {
    const bytes = Buffer.from([0xff, 0xd8]);
    expect(matchesDeclaredFileType(bytes, "image/jpeg")).toBe(false);
  });

  it("rejects an empty buffer", () => {
    expect(matchesDeclaredFileType(Buffer.alloc(0), "application/pdf")).toBe(false);
  });
});
