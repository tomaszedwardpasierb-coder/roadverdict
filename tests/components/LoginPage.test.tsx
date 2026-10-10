// The sign-in page speaks to new visitors: most arrive from a "Start your
// motorcycle's/car's logbook" button and have no account yet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockSearchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
const redirectMock = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }));
const getSessionMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.current,
  redirect: redirectMock,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: getSessionMock }));
vi.mock("@/components/FunnelBeacon", () => ({ FunnelBeacon: () => null }));

import { LoginScreen as LoginPage } from "@/app/login/LoginScreen";
import LoginRoute from "@/app/login/page";

afterEach(() => {
  mockSearchParams.current = new URLSearchParams();
  redirectMock.mockClear();
  getSessionMock.mockReset();
});

describe("Login page for someone already signed in", () => {
  it("sends them straight on to where the link was going", async () => {
    getSessionMock.mockResolvedValue({ email: "rider@example.com" });
    await expect(LoginRoute({ searchParams: Promise.resolve({ redirect: "/dashboard?addVehicle=car&vrm=AB12CDE" }) })).rejects.toThrow(
      "REDIRECT /dashboard?addVehicle=car&vrm=AB12CDE"
    );
  });

  it("goes to the dashboard when there's no safe place to return to", async () => {
    getSessionMock.mockResolvedValue({ email: "rider@example.com" });
    await expect(LoginRoute({ searchParams: Promise.resolve({ redirect: "//evil.example" }) })).rejects.toThrow("REDIRECT /dashboard");
  });

  it("offers Continue with Google only once it's set up, keeping where the visitor was going", () => {
    mockSearchParams.current = new URLSearchParams("redirect=%2Fdashboard%3FaddVehicle%3Dbike&src=google");
    const { unmount } = render(<LoginPage />);
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    unmount();
    render(<LoginPage googleEnabled />);
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/api/auth/google/start?src=google&redirect=%2Fdashboard%3FaddVehicle%3Dbike"
    );
  });

  it("shows the form to everyone else", async () => {
    getSessionMock.mockResolvedValue(null);
    render(await LoginRoute({ searchParams: Promise.resolve({}) }));
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send sign-in link" })).toBeInTheDocument();
  });
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
