// Place at: tests/components/AttachmentUploader.test.tsx
//
// Only `fetch` is mocked - the real upload -> onChange -> optional
// verify-receipt sequence runs as written. `value` is a plain prop (the
// component holds no attachment state of its own), so a small stateful
// wrapper is used for the round-trip tests that need the chip to
// actually appear after a successful upload.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentUploader } from "@/app/dashboard/AttachmentUploader";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

function Wrapper({ compareValues }: { compareValues?: { cost: number; date: string } }) {
  const [value, setValue] = useState<Attachment | null>(null);
  return <AttachmentUploader value={value} onChange={setValue} compareValues={compareValues} />;
}

function makeFile(name = "receipt.jpg", type = "image/jpeg") {
  return new File(["dummy contents"], name, { type });
}

describe("AttachmentUploader", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the file input, not a chip, when there's no attachment yet", () => {
    render(<AttachmentUploader value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Receipt or invoice (optional)")).toHaveAttribute("type", "file");
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("uploads the picked file as multipart form data and calls onChange with the server's attachment", async () => {
    const onChange = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ attachment: { blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" } }),
    });
    const user = userEvent.setup();
    render(<AttachmentUploader value={null} onChange={onChange} />);
    await user.upload(screen.getByLabelText("Receipt or invoice (optional)"), makeFile());

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" })
    );
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/tracker/upload-attachment");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("after a successful upload, shows the attachment as a chip with a working remove button", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ attachment: { blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" } }),
    });
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.upload(screen.getByLabelText("Receipt or invoice (optional)"), makeFile());

    expect(await screen.findByText("receipt.jpg")).toBeInTheDocument();
    expect(screen.queryByLabelText("Receipt or invoice (optional)")).not.toBeInTheDocument(); // file input replaced by the chip

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByLabelText("Receipt or invoice (optional)")).toBeInTheDocument();
    expect(screen.queryByText("receipt.jpg")).not.toBeInTheDocument();
  });

  it("shows the server's own error message when the upload response isn't ok, and never calls onChange", async () => {
    const onChange = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "File too large." }) });
    const user = userEvent.setup();
    render(<AttachmentUploader value={null} onChange={onChange} />);
    await user.upload(screen.getByLabelText("Receipt or invoice (optional)"), makeFile());

    expect(await screen.findByRole("alert")).toHaveTextContent("File too large.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a generic connection error when fetch itself rejects", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<AttachmentUploader value={null} onChange={vi.fn()} />);
    await user.upload(screen.getByLabelText("Receipt or invoice (optional)"), makeFile());

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });

  it("when compareValues is supplied, a successful upload also calls verify-receipt and surfaces its discrepancies", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ attachment: { blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ discrepancies: ["The receipt shows £45.00, but you entered £40.00."] }),
      });
    const user = userEvent.setup();
    render(<Wrapper compareValues={{ cost: 40, date: "2026-01-01" }} />);
    await user.upload(screen.getByLabelText("Receipt or invoice (optional)"), makeFile());

    expect(await screen.findByText("The receipt shows £45.00, but you entered £40.00.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/verify-receipt",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ blobName: "abc123", expectedCost: 40, expectedDate: "2026-01-01" }),
      })
    );
  });

  it("never calls verify-receipt when compareValues isn't supplied", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ attachment: { blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" } }),
    });
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.upload(screen.getByLabelText("Receipt or invoice (optional)"), makeFile());

    await screen.findByText("receipt.jpg");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
