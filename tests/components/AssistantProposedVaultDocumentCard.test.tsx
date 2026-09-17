// Place at: tests/components/AssistantProposedVaultDocumentCard.test.tsx
//
// The model never sees or handles the file - it's picked directly on
// this card, uploaded straight to /api/vault/documents. A locked Vault
// is handled inline via VaultAuthModal, the exact same component the
// real Vault tab uses. Only fetch and next/navigation's useRouter are
// mocked; everything else runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AssistantProposedVaultDocumentCard, type ProposedVaultDocument } from "@/components/AssistantProposedVaultDocumentCard";

const bikeDoc: ProposedVaultDocument = {
  category: "vaultDocument",
  vehicleKind: "bike",
  vehicleId: "bike-1",
  vaultCategory: "dvlaLegal",
  label: "V5C",
};

const carDocNoGuess: ProposedVaultDocument = {
  category: "vaultDocument",
  vehicleKind: "car",
  vehicleId: "car-1",
  vaultCategory: "",
  label: "",
};

function makeFile(name = "v5c.jpg", type = "image/jpeg") {
  return new File(["file contents"], name, { type });
}

describe("AssistantProposedVaultDocumentCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows a loading state while checking Vault status", () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);
    expect(screen.getByText(/Checking the Vault/)).toBeInTheDocument();
  });

  it("shows the re-auth prompt when the Vault status check reports locked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ unlocked: false }) });
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);

    expect(await screen.findByText("Confirm it's you")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/vault/status");
  });

  it("shows the upload form, pre-filled with the model's own guessed category and label, once unlocked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ unlocked: true }) });
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);

    expect(await screen.findByLabelText("Category")).toHaveValue("dvlaLegal");
    expect(screen.getByLabelText("Label (optional)")).toHaveValue("V5C");
    expect(screen.getByRole("button", { name: "Add document" })).toBeDisabled(); // no file chosen yet
  });

  it("leaves category unset when the model made no guess, requiring the user to choose one", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ unlocked: true }) });
    render(<AssistantProposedVaultDocumentCard document={carDocNoGuess} />);

    expect(await screen.findByLabelText("Category")).toHaveValue("");
    expect(screen.getByLabelText("Label (optional)")).toHaveValue("");
  });

  it("treats a fetch failure on the status check as locked, same as an explicit 401", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);
    expect(await screen.findByText("Confirm it's you")).toBeInTheDocument();
  });

  it("uploads the chosen file as multipart form data to /api/vault/documents, with the vehicle's own id/kind", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unlocked: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ document: { id: "vd-1" } }) });
    const user = userEvent.setup();
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);

    const fileInput = await screen.findByLabelText(/File \(PDF, JPG, or PNG/);
    await user.upload(fileInput, makeFile());
    await user.click(screen.getByRole("button", { name: "Add document" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(url).toBe("/api/vault/documents");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("vehicleKind")).toBe("bike");
    expect(body.get("vehicleId")).toBe("bike-1");
    expect(body.get("category")).toBe("dvlaLegal");
    expect(body.get("label")).toBe("V5C");
    expect((body.get("file") as File).name).toBe("v5c.jpg");

    expect(await screen.findByText("✓ Added to Vault - V5C")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("omits the label field entirely when left blank", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unlocked: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ document: { id: "vd-1" } }) });
    const user = userEvent.setup();
    render(<AssistantProposedVaultDocumentCard document={carDocNoGuess} />);

    await user.selectOptions(await screen.findByLabelText("Category"), "insurance");
    await user.upload(screen.getByLabelText(/File \(PDF, JPG, or PNG/), makeFile());
    await user.click(screen.getByRole("button", { name: "Add document" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const body = init.body as FormData;
    expect(body.get("label")).toBeNull();
  });

  it("falls back to re-auth if the upload itself comes back vault_locked (a race between the status check and the submit)", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unlocked: true }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "vault_locked" }) });
    const user = userEvent.setup();
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);

    await user.upload(await screen.findByLabelText(/File \(PDF, JPG, or PNG/), makeFile());
    await user.click(screen.getByRole("button", { name: "Add document" }));

    expect(await screen.findByText("Confirm it's you")).toBeInTheDocument();
  });

  it("shows the server's own error message on a genuine upload failure, without showing the added confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unlocked: true }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "File too large." }) });
    const user = userEvent.setup();
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);

    await user.upload(await screen.findByLabelText(/File \(PDF, JPG, or PNG/), makeFile());
    await user.click(screen.getByRole("button", { name: "Add document" }));

    expect(await screen.findByText("File too large.")).toBeInTheDocument();
    expect(screen.queryByText(/Added to Vault/)).not.toBeInTheDocument();
  });

  it("shows a distinct timed-out message when the upload stalls instead of rejecting", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unlocked: true }) })
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AssistantProposedVaultDocumentCard document={bikeDoc} />);

    await user.upload(await screen.findByLabelText(/File \(PDF, JPG, or PNG/), makeFile());
    await user.click(screen.getByRole("button", { name: "Add document" }));

    await vi.advanceTimersByTimeAsync(45_000);

    expect(await screen.findByText("Upload timed out - try again.")).toBeInTheDocument();
    expect(screen.queryByText(/Added to Vault/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
