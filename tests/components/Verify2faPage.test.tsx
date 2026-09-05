// Place at: tests/components/Verify2faPage.test.tsx
//
// The code-entry step reached after clicking a magic link on a 2FA
// account (see verify/route.ts). Real navigation on success is a hard
// `window.location.href` assignment, not router.push - the server just
// set a real httpOnly session cookie that every server component past
// this point needs to see on a fresh request - so that's stubbed and
// asserted directly rather than mocking next/navigation's useRouter.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSearchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.current,
}));

import Verify2faPage from "@/app/login/verify-2fa/page";

describe("Verify2faPage", () => {
  let originalLocation: Location;

  beforeEach(() => {
    mockSearchParams.current = new URLSearchParams();
    originalLocation = window.location;
    // @ts-expect-error - deliberately replacing window.location for this suite
    delete window.location;
    // @ts-expect-error - a minimal stand-in, only `href` is ever touched here
    window.location = { href: "" };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error - restoring the real Location object this suite replaced above
    delete window.location;
    // @ts-expect-error - see above
    window.location = originalLocation;
  });

  it("renders the code-entry form", () => {
    render(<Verify2faPage />);
    expect(screen.getByLabelText("Code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
  });

  it("a wrong code shows the server's error and does not navigate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Incorrect code." }) }));

    const user = userEvent.setup();
    render(<Verify2faPage />);
    await user.type(screen.getByLabelText("Code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code.");
    expect(window.location.href).toBe("");
  });

  it("a correct code navigates to the dashboard by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    const user = userEvent.setup();
    render(<Verify2faPage />);
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await vi.waitFor(() => expect(window.location.href).toBe("/dashboard"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/totp/login-verify",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "123456" }) })
    );
  });

  it("navigates to a safe redirect destination from the URL when one is present", async () => {
    mockSearchParams.current = new URLSearchParams([["redirect", "/tracker/settings"]]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    const user = userEvent.setup();
    render(<Verify2faPage />);
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await vi.waitFor(() => expect(window.location.href).toBe("/tracker/settings"));
  });

  it("falls back to the dashboard for an unsafe off-host redirect param, even on success", async () => {
    mockSearchParams.current = new URLSearchParams([["redirect", "https://evil.example/phish"]]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    const user = userEvent.setup();
    render(<Verify2faPage />);
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await vi.waitFor(() => expect(window.location.href).toBe("/dashboard"));
  });

  it("a connection error shows a generic message and does not navigate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<Verify2faPage />);
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Check your connection and try again.");
    expect(window.location.href).toBe("");
  });
});
