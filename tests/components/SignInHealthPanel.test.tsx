// Place at: tests/components/SignInHealthPanel.test.tsx
//
// Sign-in health on /tomasz: codes requested vs entered over 24 hours, and the
// people who asked for a code and never got in.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInHealthPanel } from "@/app/tomasz/SignInHealthPanel";
import type { SignInHealth } from "@/lib/admin/signInEvents";

const NOW = new Date("2026-10-08T12:00:00Z");

const base: SignInHealth = {
  windowHours: 24,
  requested: 0,
  entered: 0,
  wrong: 0,
  expired: 0,
  sendFailed: 0,
  people: 0,
  signedIn: 0,
  stuck: [],
  status: "ok",
};

describe("SignInHealthPanel", () => {
  it("says so, instead of showing zeros, when the records couldn't be loaded", () => {
    render(<SignInHealthPanel health={null} now={NOW} />);
    expect(screen.getByText(/Couldn't load the sign-in records/)).toBeInTheDocument();
    expect(screen.queryByText("Codes requested")).not.toBeInTheDocument();
  });

  it("shows all good when nobody has asked for a code", () => {
    render(<SignInHealthPanel health={base} now={NOW} />);
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.getByText(/No one asked for a code in the last 24 hours/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows all good, with the people count, when everyone who asked got in", () => {
    render(<SignInHealthPanel health={{ ...base, requested: 3, entered: 3, people: 3, signedIn: 3 }} now={NOW} />);
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.getByText(/Everyone who asked for a code in the last 24 hours has signed in\./)).toBeInTheDocument();
    expect(screen.getByText("Codes requested")).toBeInTheDocument();
    expect(screen.getByText("Codes entered (signed in)")).toBeInTheDocument();
  });

  it("flags people who asked more than ten minutes ago and haven't got in", () => {
    const health: SignInHealth = {
      ...base,
      requested: 2,
      people: 2,
      status: "watch",
      stuck: [
        { email: "lost@example.com", requestedAt: "2026-10-08T09:00:00.000Z", minutesAgo: 180, sendFailed: false, failedTries: 2, stillValid: false },
        { email: "new@example.com", requestedAt: "2026-10-08T11:56:00.000Z", minutesAgo: 4, sendFailed: false, failedTries: 0, stillValid: true },
      ],
    };
    render(<SignInHealthPanel health={health} now={NOW} />);
    expect(screen.getByText(/Worth a look:/)).toBeInTheDocument();
    expect(screen.getByText("lost@example.com")).toBeInTheDocument();
    expect(screen.getByText("Hasn't signed in")).toBeInTheDocument();
    expect(screen.getByText("Waiting (code still valid)")).toBeInTheDocument();
    expect(screen.getByText("3h ago")).toBeInTheDocument();
  });

  it("raises a problem when the email service refused a message", () => {
    const health: SignInHealth = {
      ...base,
      requested: 1,
      people: 1,
      sendFailed: 1,
      status: "problem",
      stuck: [{ email: "refused@example.com", requestedAt: "2026-10-08T10:00:00.000Z", minutesAgo: 120, sendFailed: true, failedTries: 0, stillValid: false }],
    };
    render(<SignInHealthPanel health={health} now={NOW} />);
    expect(screen.getByText(/Problem:/)).toBeInTheDocument();
    expect(screen.getByText("Email refused")).toBeInTheDocument();
    expect(screen.queryByText("All good")).not.toBeInTheDocument();
  });

  it("explains what the panel covers and leaves out", () => {
    render(<SignInHealthPanel health={base} now={NOW} />);
    expect(screen.getByText(/website sign-in links aren't included/)).toBeInTheDocument();
  });
});
