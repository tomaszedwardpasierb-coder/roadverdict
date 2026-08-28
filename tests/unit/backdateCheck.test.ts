import { describe, expect, it } from "vitest";
import { daysBackdated, detectBulkBackdating, isBackdated } from "@/lib/tracker/backdateCheck";

describe("backdate checks", () => {
  it("does not flag a normal delayed entry", () => {
    expect(daysBackdated("2025-01-01", "2025-01-07T00:00:00.000Z")).toBe(6);
    expect(isBackdated("2025-01-01", "2025-01-07T00:00:00.000Z")).toBe(false);
  });

  it("detects entries entered together across a long history span", () => {
    const createdAt = "2025-06-01T12:00:00.000Z";
    const result = detectBulkBackdating([
      { id: "1", date: "2022-01-01", createdAt, hasAttachment: true },
      { id: "2", date: "2022-06-01", createdAt, hasAttachment: true },
      { id: "3", date: "2023-01-01", createdAt, hasAttachment: false },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ count: 3, earliestClaimedDate: "2022-01-01", latestClaimedDate: "2023-01-01" });
  });
});