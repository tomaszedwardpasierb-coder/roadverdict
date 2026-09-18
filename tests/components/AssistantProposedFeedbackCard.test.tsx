// Place at: tests/components/AssistantProposedFeedbackCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AssistantProposedFeedbackCard, type ProposedFeedback } from "@/components/AssistantProposedFeedbackCard";

const featureDraft: ProposedFeedback = { category: "feedback", feedbackType: "feature", message: "Add dark mode" };
const bugDraft: ProposedFeedback = { category: "feedback", feedbackType: "bug", message: "The chart is blank" };

function makeFile(name: string, type = "image/png") {
  return new File(["contents"], name, { type });
}

describe("AssistantProposedFeedbackCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pre-fills the type and message from the draft", () => {
    render(<AssistantProposedFeedbackCard feedback={bugDraft} />);
    expect(screen.getByLabelText("Type")).toHaveValue("bug");
    expect(screen.getByLabelText("Message")).toHaveValue("The chart is blank");
  });

  it("only shows the screenshot picker for a bug report, not a feature request", () => {
    // Two separate instances, not a rerender of one - feedbackType is
    // only ever initialized from props once (same pattern every other
    // propose* card uses), matching how a real proposed-feedback card is
    // always a freshly-mounted instance per chat message, never reused
    // in place with a different draft.
    const { unmount } = render(<AssistantProposedFeedbackCard feedback={featureDraft} />);
    expect(screen.queryByLabelText(/Screenshots/)).not.toBeInTheDocument();
    unmount();

    render(<AssistantProposedFeedbackCard feedback={bugDraft} />);
    expect(screen.getByLabelText(/Screenshots/)).toBeInTheDocument();
  });

  it("rejects confirming with an empty message, without calling fetch", async () => {
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={featureDraft} />);
    await user.clear(screen.getByLabelText("Message"));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a message first.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a feature request with no attachments, posting to the shared feedback endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={featureDraft} />);

    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("✓ Sent - thanks for letting us know.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "feature", message: "Add dark mode", attachments: [], source: "assistant" }),
      })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("uploads each picked screenshot before sending a bug report, including the resulting attachments", async () => {
    const attachment1 = { blobName: "b1", fileName: "one.png", fileType: "image/png", uploadedAt: "2026-01-01" };
    const attachment2 = { blobName: "b2", fileName: "two.png", fileType: "image/png", uploadedAt: "2026-01-01" };
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ attachment: attachment1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ attachment: attachment2 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={bugDraft} />);

    await user.upload(screen.getByLabelText(/Screenshots/), [makeFile("one.png"), makeFile("two.png")]);
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("✓ Sent - thanks for letting us know.")).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/account/feedback/upload-attachment", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/account/feedback/upload-attachment", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/account/feedback",
      expect.objectContaining({ body: JSON.stringify({ type: "bug", message: "The chart is blank", attachments: [attachment1, attachment2], source: "assistant" }) })
    );
  });

  it("refuses a single pick of more than 3 screenshots at once", async () => {
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={bugDraft} />);
    const input = screen.getByLabelText(/Screenshots/);

    await user.upload(input, [makeFile("a.png"), makeFile("b.png"), makeFile("c.png"), makeFile("d.png")]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Up to 3 screenshots allowed.");
    expect(screen.queryByText("a.png")).not.toBeInTheDocument();
  });

  // Once 3 are already picked, the input disables itself outright,
  // preventing over-selection rather than accepting-then-rejecting a
  // 4th pick through a second dialog.
  it("disables the picker once 3 screenshots are already selected", async () => {
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={bugDraft} />);
    const input = screen.getByLabelText(/Screenshots/);

    await user.upload(input, [makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);

    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(screen.getByText("c.png")).toBeInTheDocument();
    expect(input).toBeDisabled();
  });

  it("lets a picked screenshot be removed before sending", async () => {
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={bugDraft} />);
    await user.upload(screen.getByLabelText(/Screenshots/), [makeFile("a.png")]);
    expect(screen.getByText("a.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove a.png" }));
    expect(screen.queryByText("a.png")).not.toBeInTheDocument();
  });

  it("shows an error and stops if a screenshot upload itself fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Upload failed. Please try again." }) });
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={bugDraft} />);
    await user.upload(screen.getByLabelText(/Screenshots/), [makeFile("a.png")]);

    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Upload failed. Please try again.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1); // never reached the /api/account/feedback POST
  });

  it("shows the server's own error message and stays editable rather than showing the sent state", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Could not save your feedback right now. Please try again." }) });
    const user = userEvent.setup();
    render(<AssistantProposedFeedbackCard feedback={featureDraft} />);

    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Could not save your feedback right now. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("✓ Sent - thanks for letting us know.")).not.toBeInTheDocument();
  });
});
