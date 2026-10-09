// Place at: tests/components/MotCheckResult.test.tsx
// What the free MOT check shows for one vehicle.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MotCheckResult } from "@/app/mot-check/MotCheckResult";
import type { MotRecord } from "@/lib/mot/motRecord";

const NOW = new Date("2026-10-09T12:00:00Z");

const bike: MotRecord = {
  registration: "YA16MTO",
  make: "YAMAHA",
  model: "MT-07",
  fuelType: "PETROL",
  colour: "BLUE",
  motDueDate: "2027-03-12",
  kind: "bike",
  source: "vdg",
  tests: [
    {
      date: "2026-03-13T10:00:00",
      passed: true,
      mileage: 33882,
      expiryDate: "2027-03-12",
      defects: [
        { type: "ADVISORY", text: "Drive chain excessively slack", dangerous: false },
        { type: "ADVISORY", text: "Rear tyre worn close to legal limit", dangerous: false },
      ],
    },
    { date: "2025-03-18T10:00:00", passed: true, mileage: 30071, expiryDate: "2026-03-17", defects: [] },
  ],
};

describe("MotCheckResult", () => {
  it("shows the vehicle, a valid MOT and the score with its reasons", () => {
    render(<MotCheckResult record={bike} now={NOW} />);
    expect(screen.getByRole("heading", { level: 2, name: "Yamaha MT-07" })).toBeInTheDocument();
    expect(screen.getByText("MOT valid until 12 March 2027")).toBeInTheDocument();
    const score = screen.getByRole("heading", { name: "RoadVerdict MOT score" }).closest("section")!;
    expect(within(score).getByText("96")).toBeInTheDocument();
    expect(within(score).getByText("2 advisories or minor defects at the latest MOT")).toBeInTheDocument();
    expect(within(score).getByText(/isn’t a prediction of future repairs/)).toBeInTheDocument();
  });

  it("explains each defect, with a sourced cost and a quote link only where we have prices", () => {
    render(<MotCheckResult record={bike} now={NOW} />);
    expect(screen.getByText("Drive chain excessively slack")).toBeInTheDocument();
    expect(screen.getByText(/Typical cost: chain and sprockets £\d+-£\d+, depending on the motorcycle/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Got a quote? Check it" })).toHaveLength(2);
    expect(screen.getByText("No defects or advisories recorded.")).toBeInTheDocument();
  });

  it("lists the mileage at each MOT, oldest first", () => {
    render(<MotCheckResult record={bike} now={NOW} />);
    const mileage = screen.getByRole("heading", { name: "Mileage at each MOT" }).closest("section")!;
    expect(within(mileage).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["18 March 202530,071 miles", "13 March 202633,882 miles"]);
  });

  it("shows one mileage for a fail and its same-day retest", () => {
    const failFirst = { ...bike.tests[0], date: "2026-03-13T09:00:00", passed: false };
    render(<MotCheckResult record={{ ...bike, tests: [bike.tests[0], failFirst, bike.tests[1]] }} now={NOW} />);
    const mileage = screen.getByRole("heading", { name: "Mileage at each MOT" }).closest("section")!;
    expect(within(mileage).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Every MOT test (3)" })).toBeInTheDocument();
  });

  it("saves a bike with its registration through sign-in", () => {
    render(<MotCheckResult record={bike} now={NOW} />);
    expect(screen.getByRole("link", { name: "Save to my garage" })).toHaveAttribute(
      "href",
      `/login?redirect=${encodeURIComponent("/dashboard?addVehicle=bike&vrm=YA16MTO")}`
    );
    expect(screen.getByRole("link", { name: "Run the full history check" })).toHaveAttribute("href", "/buying-guide");
  });

  it("offers both kinds when it can't tell, and says when an MOT has run out", () => {
    render(<MotCheckResult record={{ ...bike, kind: null, motDueDate: "2026-01-01" }} now={NOW} />);
    expect(screen.getByRole("link", { name: "Save as a motorcycle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save as a car" })).toBeInTheDocument();
    expect(screen.getByText("MOT expired on 1 January 2026")).toBeInTheDocument();
  });
});
