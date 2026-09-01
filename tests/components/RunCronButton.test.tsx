// Place at: tests/components/RunCronButton.test.tsx
//
// This component only ever receives `name` as a literal prop from
// src/app/tomasz/page.tsx (e.g. name="check-reminders") - it has no
// text input of its own, so there's no way for a user interacting with
// this component to type an arbitrary cron name. The real constraint
// lives server-side: src/app/api/admin/run-cron/[name]/route.ts keeps
// its own VALID_NAMES allowlist and 400s on anything else, independent
// of whatever this button is told to request. These tests cover this
// component's own job - triggering the request and rendering whatever
// the server sends back - not the server-side allowlist itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { RunCronButton } from "@/app/tomasz/RunCronButton";

describe("RunCronButton", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the exact cron name it was given, and pretty-prints a successful JSON result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ processed: 3, skipped: 1 }) })
    );

    const user = userEvent.setup();
    render(<RunCronButton name="check-reminders" label="Run now" />);
    await user.click(screen.getByRole("button", { name: "Run now" }));

    expect(fetch).toHaveBeenCalledWith("/api/admin/run-cron/check-reminders", { method: "POST" });
    // Matched via textContent rather than screen's default text matcher: the
    // rendered block preserves JSON.stringify's real newlines/indentation,
    // which the default matcher's whitespace normalization would otherwise
    // have to fight against.
    expect(
      await screen.findByText((_, element) => element?.textContent === JSON.stringify({ processed: 3, skipped: 1 }, null, 2))
    ).toBeInTheDocument();
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("shows the running label and disables the button while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }))
    );

    const user = userEvent.setup();
    render(<RunCronButton name="audit-mileage" label="Run audit" />);
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    const button = await screen.findByRole("button", { name: "Running…" });
    expect(button).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(screen.getByRole("button", { name: "Run audit" })).not.toBeDisabled());
  });

  it("shows the server's own error message when the allowlisted route rejects the request (e.g. 400 Unknown cron)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Unknown cron." }) })
    );

    const user = userEvent.setup();
    render(<RunCronButton name="backfill-users" label="Run backfill" />);
    await user.click(screen.getByRole("button", { name: "Run backfill" }));

    expect(await screen.findByText("Unknown cron.")).toBeInTheDocument();
  });

  it("falls back to 'Failed' when a not-ok response has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const user = userEvent.setup();
    render(<RunCronButton name="update-fuel-price" label="Run now" />);
    await user.click(screen.getByRole("button", { name: "Run now" }));

    expect(await screen.findByText("Failed")).toBeInTheDocument();
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<RunCronButton name="seed-assistant-config" label="Run seed" />);
    await user.click(screen.getByRole("button", { name: "Run seed" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
