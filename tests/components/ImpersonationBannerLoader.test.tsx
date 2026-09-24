// Place at: tests/components/ImpersonationBannerLoader.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockPathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ImpersonationBannerLoader } from "@/app/ImpersonationBannerLoader";

function setMarker(on: boolean) {
  document.cookie = on ? "rv_imp=1; path=/" : "rv_imp=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

describe("ImpersonationBannerLoader", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/dashboard");
    setMarker(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setMarker(false);
  });

  it("renders nothing and makes no request for everyone but an impersonating admin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ImpersonationBannerLoader />);

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the banner when the marker is present and the server confirms a valid admin session", async () => {
    setMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: "user@example.com" }) }));
    render(<ImpersonationBannerLoader />);

    expect(await screen.findByText(/admin impersonation active/i)).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/admin/impersonation-status", expect.anything());
  });

  it("shows nothing when the marker is present but the server says there's no valid admin session (the cookie alone is never enough)", async () => {
    setMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: null }) }));
    const { container } = render(<ImpersonationBannerLoader />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("removes the banner on the next navigation once the marker cookie is gone (exiting impersonation)", async () => {
    setMarker(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: "user@example.com" }) }));
    const { rerender } = render(<ImpersonationBannerLoader />);
    expect(await screen.findByText(/admin impersonation active/i)).toBeInTheDocument();

    setMarker(false);
    mockPathname.mockReturnValue("/tomasz");
    rerender(<ImpersonationBannerLoader />);

    await waitFor(() => expect(screen.queryByText(/admin impersonation active/i)).not.toBeInTheDocument());
  });
});
