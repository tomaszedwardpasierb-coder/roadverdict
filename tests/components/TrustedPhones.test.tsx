// Place at: tests/components/TrustedPhones.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrustedPhones } from "@/app/dashboard/TrustedPhones";

const PHONE = { id: "dev-1", name: "Google Pixel 7", createdAt: "2026-10-01T09:00:00.000Z", lastUsedAt: null };

describe("TrustedPhones", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows nothing until a phone has been trusted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ devices: [] }) }));
    const { container } = render(<TrustedPhones />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("lists trusted phones and removes one after confirming", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [PHONE] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ devices: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TrustedPhones />);
    expect(await screen.findByText("Google Pixel 7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/account/trusted-devices/dev-1", { method: "DELETE" });
    await waitFor(() => expect(screen.queryByText("Google Pixel 7")).not.toBeInTheDocument());
  });
});
