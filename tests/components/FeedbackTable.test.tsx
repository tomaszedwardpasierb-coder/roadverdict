// Place at: tests/components/FeedbackTable.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FeedbackDoc } from "@/lib/tracker/feedback";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

import { FeedbackTable } from "@/app/tomasz/FeedbackTable";

const items: FeedbackDoc[] = [
  {
    id: "f1",
    pk: "feedback-log",
    type: "feedback",
    feedbackType: "bug",
    message: "The mileage chart is blank",
    email: "rider@example.com",
    submittedAt: "2026-01-01T10:00:00.000Z",
    status: "new",
    source: "settings",
    attachments: [{ blobName: "b1.png", fileName: "screenshot.png", fileType: "image/png", uploadedAt: "2026-01-01T10:00:00.000Z" }],
  },
  {
    id: "f2",
    pk: "feedback-log",
    type: "feedback",
    feedbackType: "feature",
    message: "Add dark mode",
    email: "other@example.com",
    submittedAt: "2026-02-01T10:00:00.000Z",
    status: "resolved",
    source: "assistant",
  },
];

describe("FeedbackTable", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows an empty note when there's no feedback at all", () => {
    render(<FeedbackTable items={[]} />);
    expect(screen.getByText("No feedback submitted yet.")).toBeInTheDocument();
  });

  it("renders every item's type, email, message, and source", () => {
    render(<FeedbackTable items={items} />);
    expect(screen.getByText("Bug report")).toBeInTheDocument();
    expect(screen.getByText("Feature request")).toBeInTheDocument();
    expect(screen.getByText("rider@example.com")).toBeInTheDocument();
    expect(screen.getByText("The mileage chart is blank")).toBeInTheDocument();
    expect(screen.getByText("settings")).toBeInTheDocument();
    expect(screen.getByText("assistant")).toBeInTheDocument();
  });

  it("links an attachment to the admin-only serving route, and shows a dash when there are none", () => {
    render(<FeedbackTable items={items} />);
    const link = screen.getByRole("link", { name: "screenshot.png" });
    expect(link).toHaveAttribute("href", "/api/tomasz/feedback-attachment/b1.png");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("-")).toBeInTheDocument(); // f2 has no attachments
  });

  it("changes a row's status via PATCH and refreshes on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const user = userEvent.setup();
    render(<FeedbackTable items={items} />);

    const [firstSelect] = screen.getAllByLabelText("Status");
    await user.selectOptions(firstSelect, "reviewed");

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/feedback/f1/status",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "reviewed" }) })
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("does not refresh when the status update fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Could not update status." }) });
    const user = userEvent.setup();
    render(<FeedbackTable items={items} />);

    const [firstSelect] = screen.getAllByLabelText("Status");
    await user.selectOptions(firstSelect, "reviewed");

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
