// Place at: tests/components/LockedStatCard.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LockedStatCard } from "@/app/dashboard/LockedStatCard";

describe("LockedStatCard", () => {
  it("shows the real label and icon but 'Premium' instead of a value, linking to /pro", () => {
    render(<LockedStatCard icon="economy" iconClass="some-class" label="Actual economy" />);
    expect(screen.getByText("Actual economy")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/pro");
  });

  it("reflects whatever label it's given, e.g. a distance-unit-dependent 'Per km'", () => {
    render(<LockedStatCard icon="perMile" iconClass="some-class" label="Per km" />);
    expect(screen.getByText("Per km")).toBeInTheDocument();
  });
});
