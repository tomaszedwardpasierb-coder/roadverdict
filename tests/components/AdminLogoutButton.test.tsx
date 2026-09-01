// Place at: tests/components/AdminLogoutButton.test.tsx
//
// Trivial by design: one click posts to /api/admin/logout, then
// navigates to the login page. Only `fetch` and next/navigation's
// useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { AdminLogoutButton } from "@/app/tomasz/AdminLogoutButton";

describe("AdminLogoutButton", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /api/admin/logout and redirects to the login page", async () => {
    const user = userEvent.setup();
    render(<AdminLogoutButton />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(fetch).toHaveBeenCalledWith("/api/admin/logout", { method: "POST" });
    expect(mockRouter.push).toHaveBeenCalledWith("/tomasz/login");
  });
});
