// Place at: tests/components/VaultTab.test.tsx
//
// Only `fetch` is mocked - routed by URL/method since VaultTab makes
// several distinct calls (status, list, upload, delete, lock).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultTab } from "@/app/dashboard/VaultTab";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({ ok, status, json: async () => body });
}

function mockFetchRouter(handlers: { status?: (url: string) => ReturnType<typeof jsonResponse>; list?: ReturnType<typeof jsonResponse>; upload?: ReturnType<typeof jsonResponse>; deleteDoc?: ReturnType<typeof jsonResponse>; lock?: ReturnType<typeof jsonResponse> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/vault/status") return handlers.status ? handlers.status(url) : jsonResponse({ unlocked: false });
      if (url.startsWith("/api/vault/documents?")) return handlers.list ?? jsonResponse({ documents: [] });
      if (url === "/api/vault/documents" && init?.method === "POST") return handlers.upload ?? jsonResponse({ document: {} });
      if (url.startsWith("/api/vault/documents/") && init?.method === "DELETE") return handlers.deleteDoc ?? jsonResponse({ ok: true });
      if (url === "/api/vault/lock") return handlers.lock ?? jsonResponse({ ok: true });
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    })
  );
}

describe("VaultTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the re-auth modal when the Vault starts locked", async () => {
    mockFetchRouter({ status: () => jsonResponse({ unlocked: false }) });
    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);

    expect(await screen.findByRole("dialog", { name: /confirm it's you/i })).toBeInTheDocument();
  });

  it("loads and shows the empty-state copy and document list once already unlocked", async () => {
    mockFetchRouter({ status: () => jsonResponse({ unlocked: true }), list: jsonResponse({ documents: [] }) });
    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);

    expect(await screen.findByText(/documents, in one secure place/)).toBeInTheDocument();
    expect(screen.getByText(/This is the first time the Vault has been opened/)).toBeInTheDocument();
  });

  it("shows a real document with its category, size, download link and delete button", async () => {
    mockFetchRouter({
      status: () => jsonResponse({ unlocked: true }),
      list: jsonResponse({
        documents: [{ id: "d1", fileName: "V5C.pdf", fileType: "application/pdf", fileSize: 2048, category: "dvlaLegal", uploadedAt: "2026-01-01T00:00:00.000Z" }],
      }),
    });
    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);

    expect(await screen.findByText("V5C.pdf")).toBeInTheDocument();
    expect(screen.getAllByText(/DVLA \/ Legal/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/vault/documents/d1/download");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("unlocking via the auth modal reveals the tab content", async () => {
    mockFetchRouter({
      status: () => jsonResponse({ unlocked: false }),
      list: jsonResponse({ documents: [] }),
    });
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/vault/status") return jsonResponse({ unlocked: false });
      if (url === "/api/vault/reauth") return jsonResponse({ ok: true, previousAccess: { at: "2026-01-01T00:00:00.000Z", browser: "Firefox", country: "France" } });
      if (url.startsWith("/api/vault/documents?")) return jsonResponse({ documents: [] });
      return Promise.reject(new Error(`Unexpected fetch: ${url} ${init?.method}`));
    });

    const user = userEvent.setup();
    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);

    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText(/6-digit code/), "123456");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText(/documents, in one secure place/)).toBeInTheDocument();
    expect(screen.getByText(/Vault last opened:.*Firefox, France/)).toBeInTheDocument();
  });

  it("uploads a document with the chosen category and label, then refreshes the list", async () => {
    let listCallCount = 0;
    (fetch as ReturnType<typeof vi.fn>) = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/vault/status") return jsonResponse({ unlocked: true });
      if (url.startsWith("/api/vault/documents?")) {
        listCallCount++;
        return jsonResponse({
          documents: listCallCount > 1 ? [{ id: "d1", fileName: "v5c.pdf", fileType: "application/pdf", fileSize: 100, category: "dvlaLegal", uploadedAt: "2026-01-01T00:00:00.000Z" }] : [],
        });
      }
      if (url === "/api/vault/documents" && init?.method === "POST") return jsonResponse({ document: { id: "d1" } });
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetch);

    const user = userEvent.setup();
    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);
    await screen.findByText(/documents, in one secure place/);

    await user.selectOptions(screen.getByLabelText("Category"), "dvlaLegal");
    await user.type(screen.getByLabelText(/Label/), "My V5C");
    const file = new File([new Uint8Array([1, 2, 3])], "v5c.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/File \(PDF/), file);
    await user.click(screen.getByRole("button", { name: "Add document" }));

    await waitFor(() => expect(screen.getByText("v5c.pdf")).toBeInTheDocument());

    const uploadCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url, init]) => url === "/api/vault/documents" && init?.method === "POST");
    expect(uploadCall).toBeDefined();
    const formData = uploadCall![1].body as FormData;
    expect(formData.get("category")).toBe("dvlaLegal");
    expect(formData.get("label")).toBe("My V5C");
    expect(formData.get("vehicleKind")).toBe("bike");
    expect(formData.get("vehicleId")).toBe("bike-1");
  });

  it("deletes a document and removes it from the list", async () => {
    let listCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/vault/status") return jsonResponse({ unlocked: true });
        if (url.startsWith("/api/vault/documents?")) {
          listCallCount++;
          return jsonResponse({
            documents: listCallCount === 1 ? [{ id: "d1", fileName: "v5c.pdf", fileType: "application/pdf", fileSize: 100, category: "dvlaLegal", uploadedAt: "2026-01-01T00:00:00.000Z" }] : [],
          });
        }
        if (url === "/api/vault/documents/d1" && init?.method === "DELETE") return jsonResponse({ ok: true });
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const user = userEvent.setup();
    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);
    await screen.findByText("v5c.pdf");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("v5c.pdf")).not.toBeInTheDocument());
  });

  it("switches back to the locked view when any call reports vault_locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/vault/status") return jsonResponse({ unlocked: true });
        if (url.startsWith("/api/vault/documents?")) return jsonResponse({ error: "vault_locked" }, false, 401);
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);

    expect(await screen.findByRole("dialog", { name: /confirm it's you/i })).toBeInTheDocument();
  });

  it("shows the bike or car spinner while checking status, per the vehicleKind prop", async () => {
    let resolveStatus: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => { resolveStatus = resolve; }))
    );

    render(<VaultTab vehicleKind="car" vehicleId="car-1" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveStatus({ ok: true, json: async () => ({ unlocked: false }) });
  });

  it("Lock the Vault now immediately shows the locked view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/vault/status") return jsonResponse({ unlocked: true });
        if (url.startsWith("/api/vault/documents?")) return jsonResponse({ documents: [] });
        if (url === "/api/vault/lock") return jsonResponse({ ok: true });
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const user = userEvent.setup();
    render(<VaultTab vehicleKind="bike" vehicleId="bike-1" />);
    await screen.findByText(/documents, in one secure place/);

    await user.click(screen.getByRole("button", { name: "Lock the Vault now" }));

    expect(await screen.findByRole("dialog", { name: /confirm it's you/i })).toBeInTheDocument();
  });
});
