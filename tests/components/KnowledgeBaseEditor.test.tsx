// Place at: tests/components/KnowledgeBaseEditor.test.tsx
//
// The assistant's live knowledge base editor - saving here takes
// effect immediately for every user with no build/review step, so the
// confirm() before saving and the version history are the only safety
// net. The API side (/api/tomasz/assistant-config/knowledge-base and
// its /versions sub-route) already has its own tests; this file covers
// the editor's own UI contract: the Save button only enables once the
// text actually differs, history is fetched once and then cached, and
// loading an old version over unsaved edits asks first. Only `fetch`
// and window.confirm are mocked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnowledgeBaseEditor } from "@/app/tomasz/KnowledgeBaseEditor";

describe("KnowledgeBaseEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the real initial content and last-updated date, with Save disabled until the text changes", () => {
    render(<KnowledgeBaseEditor initialContent="Existing KB text." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);

    expect(screen.getByRole("textbox")).toHaveValue("Existing KB text.");
    expect(screen.getByText(/Last updated 15 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("enables Save once the text is edited, and disables it again if reverted back to the original", async () => {
    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, " More.");
    expect(screen.getByRole("button", { name: /Save/ })).not.toBeDisabled();

    await user.type(textarea, "{Backspace>6}");
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("declining the confirm dialog does not save", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn());

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    await user.type(screen.getByRole("textbox"), " Edit.");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(confirm).toHaveBeenCalledWith(
      "Save this as the assistant's live knowledge base? This takes effect immediately for every user - there's no review step after this."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("on confirm, saves the exact edited content and shows the live confirmation message", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, " Edited.");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tomasz/assistant-config/knowledge-base",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "Original. Edited." }),
      })
    );
    expect(await screen.findByText("Saved - live now.")).toBeInTheDocument();
    // Real behaviour, not necessarily intended: `dirty` is computed as
    // `content !== initialContent`, and initialContent is a static prop
    // that a successful save never updates (there's no local "last saved
    // baseline" state). So Save stays enabled after a successful save,
    // and clicking it again re-confirms and re-POSTs the exact same
    // content that was just saved, rather than becoming a no-op.
    expect(screen.getByRole("button", { name: /Save/ })).not.toBeDisabled();
  });

  it("shows the server's own error message when saving fails, and Save stays enabled so the user can retry", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Content too long." }) })
    );

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    await user.type(screen.getByRole("textbox"), " Edited.");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(await screen.findByText("Error: Content too long.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).not.toBeDisabled();
  });

  it("shows a generic save-failed message if a not-ok response's body can't even be parsed as JSON", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("not json"); } })
    );

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    await user.type(screen.getByRole("textbox"), " Edited.");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(await screen.findByText("Error: Save failed")).toBeInTheDocument();
  });

  it("clicking 'View version history' fetches and lists real versions, then toggles closed without refetching", async () => {
    const versions = [
      { id: "v2", content: "Second version content", savedAt: "2026-01-14T09:00:00.000Z" },
      { id: "v1", content: "First version content, a bit longer", savedAt: "2026-01-10T09:00:00.000Z" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ versions }) }));

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    await user.click(screen.getByRole("button", { name: "View version history" }));

    expect(await screen.findByText(/14 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText(`${"Second version content".length.toLocaleString()} chars`)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/tomasz/assistant-config/knowledge-base/versions");
    expect(fetch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Hide version history" }));
    expect(screen.queryByText(/14 Jan 2026/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View version history" }));
    expect(await screen.findByText(/14 Jan 2026/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1); // cached - not refetched the second time it's opened
  });

  it("says there are no earlier versions when the versions list comes back empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ versions: [] }) }));

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    await user.click(screen.getByRole("button", { name: "View version history" }));

    expect(await screen.findByText("No earlier versions yet.")).toBeInTheDocument();
  });

  it("loading a version when the editor is clean (no unsaved edits) applies it without asking", async () => {
    const versions = [{ id: "v1", content: "Restored content", savedAt: "2026-01-10T09:00:00.000Z" }];
    vi.stubGlobal("confirm", vi.fn());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ versions }) }));

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    await user.click(screen.getByRole("button", { name: "View version history" }));
    await user.click(await screen.findByRole("button", { name: "Load into editor" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Restored content");
    expect(screen.getByText(/Loaded the version from 10 Jan 2026.*into the editor/)).toBeInTheDocument();
    // History closes after loading a version.
    expect(screen.queryByRole("button", { name: "Hide version history" })).not.toBeInTheDocument();
  });

  it("loading a version over unsaved edits asks first, and declining leaves the unsaved edits untouched", async () => {
    const versions = [{ id: "v1", content: "Restored content", savedAt: "2026-01-10T09:00:00.000Z" }];
    vi.stubGlobal("confirm", vi.fn(() => false));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ versions }) }));

    const user = userEvent.setup();
    render(<KnowledgeBaseEditor initialContent="Original." initialUpdatedAt="2026-01-15T10:30:00.000Z" />);
    await user.type(screen.getByRole("textbox"), " Unsaved edit.");
    await user.click(screen.getByRole("button", { name: "View version history" }));
    await user.click(await screen.findByRole("button", { name: "Load into editor" }));

    expect(confirm).toHaveBeenCalledWith(
      "You have unsaved changes in the editor - loading this version will discard them. Continue?"
    );
    expect(screen.getByRole("textbox")).toHaveValue("Original. Unsaved edit.");
  });
});
