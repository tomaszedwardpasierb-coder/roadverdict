// Place at: tests/components/AttachmentThumb.test.tsx
//
// Attachment thumbnail - small, but genuinely branches on file type
// (image preview vs a plain "PDF" label) and builds a real
// encoded-blobName URL, both worth checking.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttachmentThumb } from "@/app/dashboard/AttachmentThumb";

describe("AttachmentThumb", () => {
  it("renders an <img> preview for an image attachment, linking to the real attachment endpoint", () => {
    render(
      <AttachmentThumb
        attachment={{ blobName: "receipts/a b.jpg", fileName: "a b.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01" }}
      />
    );
    const img = screen.getByRole("img", { name: "a b.jpg" });
    expect(img).toHaveAttribute("src", "/api/tracker/attachment/receipts%2Fa%20b.jpg");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/api/tracker/attachment/receipts%2Fa%20b.jpg");
  });

  it("renders a plain PDF label, with no <img>, for a non-image attachment", () => {
    render(
      <AttachmentThumb attachment={{ blobName: "invoice.pdf", fileName: "invoice.pdf", fileType: "application/pdf", uploadedAt: "2026-01-01" }}
      />
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("opens in a new tab without leaking a window.opener reference", () => {
    render(
      <AttachmentThumb attachment={{ blobName: "x.png", fileName: "x.png", fileType: "image/png", uploadedAt: "2026-01-01" }} />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });
});
