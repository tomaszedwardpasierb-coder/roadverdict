import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));

import { POST } from "@/app/api/admin/run-cron/[name]/route";

const VALID_NAME = "update-fuel-price";

function req(): Request {
  return new Request(`http://localhost/api/admin/run-cron/${VALID_NAME}`, { method: "POST" });
}

describe("POST /api/admin/run-cron/[name]", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, ran: VALID_NAME }),
    });
  });

  it("rejects a request with no admin session, and never touches the cron endpoint", async () => {
    mocks.getAdminSession.mockResolvedValue(false);

    const response = await POST(req(), { params: { name: VALID_NAME } });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown cron name even for an authenticated admin", async () => {
    mocks.getAdminSession.mockResolvedValue(true);

    const response = await POST(req(), { params: { name: "not-a-real-cron" } });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unknown cron." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The allowlist exists precisely so this route can't be turned into an
  // arbitrary internal-request proxy - a path-traversal-shaped name must be
  // rejected exactly like any other unrecognised string, not partially
  // matched against a real entry.
  it("rejects a path-traversal-shaped cron name", async () => {
    mocks.getAdminSession.mockResolvedValue(true);

    const response = await POST(req(), { params: { name: "../cron-secrets" } });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a cron name that only partially matches a real one", async () => {
    mocks.getAdminSession.mockResolvedValue(true);

    const response = await POST(req(), { params: { name: "update-fuel-price-extra" } });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invokes the internal cron endpoint with the bearer secret for a valid, authenticated request", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const priorSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";

    try {
      const response = await POST(req(), { params: { name: VALID_NAME } });

      expect(fetchMock).toHaveBeenCalledWith(
        `https://roadverdict.co.uk/api/cron/${VALID_NAME}`,
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
        })
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, ran: VALID_NAME });
    } finally {
      process.env.CRON_SECRET = priorSecret;
    }
  });

  it("forwards a non-2xx status from the underlying cron endpoint rather than masking it as success", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      status: 500,
      json: async () => ({ error: "cron failed" }),
    });

    const response = await POST(req(), { params: { name: VALID_NAME } });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "cron failed" });
  });
});
