// The sign-in page speaks to new visitors: most arrive from a "Start your
// motorcycle's/car's logbook" button and have no account yet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockSearchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.current,
}));
vi.mock("@/components/FunnelBeacon", () => ({ FunnelBeacon: () => null }));

import LoginPage from "@/app/login/page";

afterEach(() => {
  mockSearchParams.current = new URLSearchParams();
});

describe("Login page", () => {
  it("greets someone starting a motorcycle logbook as new, not as a returning user", () => {
    mockSearchParams.current = new URLSearchParams("redirect=%2Fdashboard%3FaddVehicle%3Dbike");
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Start your motorcycle's logbook");
    expect(screen.getByText(/The same link creates your free account/)).toBeInTheDocument();
  });

  it("says car for someone starting a car logbook", () => {
    mockSearchParams.current = new URLSearchParams("redirect=%2Fdashboard%3FaddVehicle%3Dcar");
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Start your car's logbook");
  });

  it("covers both returning and new people when nothing says which", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Start your free logbook – motorcycle or car");
  });

  it("lists what you get, and offers the sample bike instead of leaving", () => {
    render(<LoginPage />);
    expect(screen.getByText("Free for one vehicle")).toBeInTheDocument();
    expect(screen.getByText("No password - just a link to your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it with a sample bike first" })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("button", { name: "Send sign-in link" })).toBeInTheDocument();
  });
});
