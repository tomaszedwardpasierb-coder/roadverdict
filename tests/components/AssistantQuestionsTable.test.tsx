// Place at: tests/components/AssistantQuestionsTable.test.tsx
//
// DeleteQuestionButton is mocked out - it's a separate, already-tested
// component (DeleteQuestionButton.test.tsx doesn't exist yet, but its
// own fetch/confirm behaviour isn't this file's concern); this test is
// about AssistantQuestionsTable's own bulk-selection and bulk-delete
// behaviour, not the per-row single delete it also renders.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AssistantQuestionLogDoc } from "@/lib/tracker/assistantQuestionLog";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("@/app/tomasz/DeleteQuestionButton", () => ({
  DeleteQuestionButton: ({ id }: { id: string }) => <button type="button">Delete {id}</button>,
}));

import { AssistantQuestionsTable } from "@/app/tomasz/AssistantQuestionsTable";

function fmtDate(d: string): string {
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const questions: AssistantQuestionLogDoc[] = [
  {
    id: "q1",
    pk: "assistant-question-log",
    type: "assistantQuestion",
    question: "When is my MOT due?",
    askedAt: "2026-01-01T10:00:00.000Z",
    signedIn: true,
    email: "rider@example.com",
    hadError: false,
  },
  {
    id: "q2",
    pk: "assistant-question-log",
    type: "assistantQuestion",
    question: "How much have I spent?",
    askedAt: "2026-02-01T10:00:00.000Z",
    signedIn: false,
    hadError: true,
  },
];

describe("AssistantQuestionsTable", () => {
  beforeEach(() => mockRouter.refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("shows a plain message instead of a table when there are no questions", () => {
    render(<AssistantQuestionsTable questions={[]} />);
    expect(screen.getByText("No questions logged yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders one row per question with the right asked-by label and result", () => {
    render(<AssistantQuestionsTable questions={questions} />);

    expect(screen.getByText("When is my MOT due?")).toBeInTheDocument();
    expect(screen.getByText("rider@example.com")).toBeInTheDocument();
    expect(screen.getByText("Answered")).toBeInTheDocument();

    expect(screen.getByText("How much have I spent?")).toBeInTheDocument();
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();

    expect(screen.getByText(fmtDate(questions[0].askedAt))).toBeInTheDocument();
  });

  it("shows 'Signed in (no email captured)' for a signed-in question with no email on record", () => {
    render(
      <AssistantQuestionsTable
        questions={[{ ...questions[0], email: undefined, signedIn: true }]}
      />
    );
    expect(screen.getByText("Signed in (no email captured)")).toBeInTheDocument();
  });

  it("the bulk-delete button starts disabled with a zero count", () => {
    render(<AssistantQuestionsTable questions={questions} />);
    expect(screen.getByRole("button", { name: "Delete selected (0)" })).toBeDisabled();
  });

  it("checking a row enables the bulk-delete button and updates its count", async () => {
    const user = userEvent.setup();
    render(<AssistantQuestionsTable questions={questions} />);

    await user.click(screen.getByLabelText(`Select question asked ${fmtDate(questions[0].askedAt)}`));

    const button = screen.getByRole("button", { name: "Delete selected (1)" });
    expect(button).toBeEnabled();
  });

  it("'Select all' checks every row and updates the count to the full total", async () => {
    const user = userEvent.setup();
    render(<AssistantQuestionsTable questions={questions} />);

    await user.click(screen.getByLabelText("Select all"));

    expect(screen.getByRole("button", { name: "Delete selected (2)" })).toBeEnabled();
    expect(screen.getByLabelText(`Select question asked ${fmtDate(questions[0].askedAt)}`)).toBeChecked();
    expect(screen.getByLabelText(`Select question asked ${fmtDate(questions[1].askedAt)}`)).toBeChecked();
  });

  it("clicking 'Select all' again when everything is already selected clears the selection", async () => {
    const user = userEvent.setup();
    render(<AssistantQuestionsTable questions={questions} />);

    const selectAll = screen.getByLabelText("Select all");
    await user.click(selectAll);
    await user.click(selectAll);

    expect(screen.getByRole("button", { name: "Delete selected (0)" })).toBeDisabled();
  });

  it("declining the confirm dialog aborts the bulk delete entirely", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<AssistantQuestionsTable questions={questions} />);
    await user.click(screen.getByLabelText(`Select question asked ${fmtDate(questions[0].askedAt)}`));
    await user.click(screen.getByRole("button", { name: "Delete selected (1)" }));

    expect(confirm).toHaveBeenCalledWith("Delete 1 selected question? This cannot be undone.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pluralises the confirm message for more than one selected question", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<AssistantQuestionsTable questions={questions} />);
    await user.click(screen.getByLabelText("Select all"));
    await user.click(screen.getByRole("button", { name: "Delete selected (2)" }));

    expect(confirm).toHaveBeenCalledWith("Delete 2 selected questions? This cannot be undone.");
  });

  it("posts the selected ids, clears the selection, and refreshes on success", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, deletedCount: 1 }) }));

    const user = userEvent.setup();
    render(<AssistantQuestionsTable questions={questions} />);
    await user.click(screen.getByLabelText(`Select question asked ${fmtDate(questions[0].askedAt)}`));
    await user.click(screen.getByRole("button", { name: "Delete selected (1)" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/assistant-questions",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ ids: ["q1"] }) })
    );
    // deleting/disabled deliberately isn't reset on success (same
    // convention as BlockAccountButton) - router.refresh() is about to
    // replace this whole server-rendered tree anyway, so there's no
    // need to restore local state first.
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("shows the server's error text and does not clear the selection or refresh on failure", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Could not delete." }) }));

    const user = userEvent.setup();
    render(<AssistantQuestionsTable questions={questions} />);
    await user.click(screen.getByLabelText(`Select question asked ${fmtDate(questions[0].askedAt)}`));
    await user.click(screen.getByRole("button", { name: "Delete selected (1)" }));

    expect(await screen.findByText("Could not delete.")).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete selected (1)" })).toBeEnabled();
  });
});
