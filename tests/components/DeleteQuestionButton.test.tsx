// Place at: tests/components/DeleteQuestionButton.test.tsx
//
// A confirm-gated delete of a logged assistant question. Only `fetch`,
// window.confirm, and next/navigation's useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { DeleteQuestionButton } from "@/app/tomasz/DeleteQuestionButton";

describe("DeleteQuestionButton", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing if the confirm dialog is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<DeleteQuestionButton id="q1" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirm).toHaveBeenCalledWith("Delete this logged question? This cannot be undone.");
    expect(fetch).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("on confirm, deletes the specific question by id and refreshes the list", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const user = userEvent.setup();
    render(<DeleteQuestionButton id="q42" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/tomasz/assistant-questions/q42", { method: "DELETE" });
  });

  it("shows a busy state (…) with the button disabled while the delete is in flight", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let resolveFetch: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }))
    );

    const user = userEvent.setup();
    render(<DeleteQuestionButton id="q1" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const button = await screen.findByRole("button", { name: "…" });
    expect(button).toBeDisabled();

    resolveFetch({ ok: true });
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("if the delete request throws, the button becomes enabled again rather than stuck disabled", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const user = userEvent.setup();
    render(<DeleteQuestionButton id="q1" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("button", { name: "Delete" })).not.toBeDisabled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
