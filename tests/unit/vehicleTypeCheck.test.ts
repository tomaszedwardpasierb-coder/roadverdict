import { describe, expect, it } from "vitest";
import { classifyVehicleType } from "@/lib/tracker/vehicleTypeCheck";

describe("classifyVehicleType", () => {
  it.each(["MOTOR CYCLE", "MOTORCYCLE", "M/CYCLE", "MOPED", "SCOOTER"])(
    "classifies %s as a motorcycle",
    (bodyType) => {
      expect(classifyVehicleType(bodyType)).toBe("motorcycle");
    }
  );

  it.each([
    "SALOON", "HATCHBACK", "ESTATE", "COUPE", "CONVERTIBLE", "MPV", "SUV",
    "4X4", "VAN", "TRUCK", "MINIBUS", "PICK-UP", "PICKUP", "LIMOUSINE",
  ])("classifies %s as four-wheeled", (bodyType) => {
    expect(classifyVehicleType(bodyType)).toBe("four-wheeled");
  });

  it("is case-insensitive", () => {
    expect(classifyVehicleType("motor cycle")).toBe("motorcycle");
    expect(classifyVehicleType("hatchback")).toBe("four-wheeled");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(classifyVehicleType("   MOPED   ")).toBe("motorcycle");
  });

  it("returns unknown for an empty or whitespace-only value", () => {
    expect(classifyVehicleType("")).toBe("unknown");
    expect(classifyVehicleType("   ")).toBe("unknown");
  });

  // The source comment is explicit about this: erring toward "unknown"
  // rather than guessing wrong in either direction. A genuinely
  // unrecognized body type (quads, trikes, caravans - none of which are
  // in either keyword list) must fall through to unknown, not get
  // force-classified as one side or the other.
  it("returns unknown for a genuinely unrecognized body type, rather than guessing", () => {
    expect(classifyVehicleType("QUAD BIKE")).toBe("unknown");
    expect(classifyVehicleType("TRIKE")).toBe("unknown");
  });

  // Discovered by actually running this test, not assumed: .includes()
  // matching means a body type string can trigger a false match purely
  // by containing a keyword as a substring, not a real word. CARAVAN
  // contains "VAN" and classifies as four-wheeled as a result - harmless
  // in this specific instance, since a caravan genuinely isn't a
  // motorcycle either way, but it's a real fragility in the matching
  // approach worth having a name and a test attached to, in case a
  // future keyword addition produces a less benign false positive.
  it("classifies CARAVAN as four-wheeled - a real substring-matching quirk (contains VAN), not a targeted rule", () => {
    expect(classifyVehicleType("CARAVAN")).toBe("four-wheeled");
  });

  // .includes() matching, not exact/word-boundary matching - a real
  // design choice worth locking in deliberately, since DVLA's actual
  // free-text body type field isn't guaranteed to be an exact match to
  // these constants.
  it("matches a keyword appearing anywhere within a longer body type string", () => {
    expect(classifyVehicleType("MOTOR CYCLE - SOLO")).toBe("motorcycle");
    expect(classifyVehicleType("VAN - LIGHT GOODS")).toBe("four-wheeled");
  });

  it("checks motorcycle keywords before four-wheeled ones when a string could plausibly contain both", () => {
    // Locks in which side wins if a real body-type string ever contains
    // both a motorcycle keyword and a four-wheeled keyword - motorcycle
    // is checked first in the source, so it takes priority. No known
    // real DVLA value actually does this today; this is testing the
    // code's own precedence, not claiming the input is realistic.
    expect(classifyVehicleType("SCOOTER VAN")).toBe("motorcycle");
  });
});