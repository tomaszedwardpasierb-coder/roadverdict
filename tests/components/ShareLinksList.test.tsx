// Place at: tests/components/ShareLinksList.test.tsx
//
// ShareLinksList renders a bike owner's real share links and drives
// create/extend/delete/asking-price actions against the
// /api/tracker/share-link/[token]... routes, refreshing via
// next/navigation's router on success. Mocked: fetch, useRouter, and
// two browser APIs jsdom doesn't implement at all - window.confirm
// (defaults to undefined/falsy, not a real prompt) and
// navigator.clipboard (undefined entirely) - both genuine environment
// gaps, not component logic.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareLinksList } from "@/app/dashboard/ShareLinksList";
import type { ShareLinkDoc } from "@/lib/tracker/shareLink";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const PAST = new Date(Date.now() - 30 * 86400000).toISOString();

const links: ShareLinkDoc[] = [
  {
    id: "tok1",
    pk: "tok1",
    type: "shareLink",
    email: "owner@example.com",
    bikeId: "bike1",
    createdAt: "2024-01-01T00:00:00.000Z",
    expiresAt: FUTURE,
    recipientEmail: "buyer@example.com",
    askingPrice: 3200,
  },
  {
    id: "tok2",
    pk: "tok2",
    type: "shareLink",
    email: "owner@example.com",
    bikeId: "bike2",
    createdAt: "2023-01-01T00:00:00.000Z",
    expiresAt: PAST,
  },
];

const bikeNames = { bike1: "Honda CB500F", bike2: "Yamaha MT-07" };
const appUrl = "https://roadverdict.example";

describe("ShareLinksList", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the empty-state note when there are no links yet", () => {
    render(<ShareLinksList links={[]} bikeNames={bikeNames} appUrl={appUrl} />);
    expect(screen.getByText(/No shareable links generated yet/)).toBeInTheDocument();
  });

  it("renders each real link's bike name, recipient, asking price, url and expiry, tagging only the expired one", () => {
    render(<ShareLinksList links={links} bikeNames={bikeNames} appUrl={appUrl} />);

    expect(screen.getByText("Honda CB500F")).toBeInTheDocument();
    expect(screen.getByText("Yamaha MT-07")).toBeInTheDocument();
    expect(screen.getByText("Shared with buyer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Asking price: £3,200")).toBeInTheDocument();
    expect(screen.getByText(`${appUrl}/report/tok1`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Valid until ${fmtDate(FUTURE)}`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Expired ${fmtDate(PAST)}`))).toBeInTheDocument();
    expect(screen.getAllByText("Expired")).toHaveLength(1);
  });

  it("falls back to 'Unknown bike' for a link whose bike no longer resolves", () => {
    render(<ShareLinksList links={[links[0]]} bikeNames={{}} appUrl={appUrl} />);
    expect(screen.getByText("Unknown bike")).toBeInTheDocument();
  });

  it("Copy link writes the real report URL to the clipboard", async () => {
    // userEvent.setup() installs its own real Clipboard stub on
    // navigator.clipboard (replacing whatever was there before) - so the
    // spy has to be attached to *that* object, after setup() runs, not
    // to a stand-in defined ahead of it.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<ShareLinksList links={[links[0]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(`${appUrl}/report/tok1`);
  });

  it("Delete asks for confirmation first, and does nothing when cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<ShareLinksList links={[links[0]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("Delete, once confirmed, DELETEs the link's own endpoint and refreshes the page", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ShareLinksList links={[links[0]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/share-link/tok1", expect.objectContaining({ method: "DELETE" }));
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("Extend posts the chosen duration and refreshes on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ShareLinksList links={[links[0]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Extend" }));
    await user.selectOptions(screen.getByRole("combobox"), "1week");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/share-link/tok1/extend",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ duration: "1week" }) })
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); // back to normal actions
  });

  it("Cancelling Extend calls no fetch and returns to the normal action buttons", async () => {
    const user = userEvent.setup();
    render(<ShareLinksList links={[links[0]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Extend" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Extend" })).toBeInTheDocument();
  });

  it("Add price on a link with none yet starts from an empty input and posts the new price", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ShareLinksList links={[links[1]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Add price" }));
    const input = screen.getByPlaceholderText("e.g. 3200");
    expect(input).toHaveValue(null);
    await user.type(input, "2500");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/share-link/tok2/asking-price",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ askingPrice: 2500 }) })
    );
  });

  it("Edit price on a link that already has one is pre-filled, and clearing it sends null to clear it server-side", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ShareLinksList links={[links[0]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Edit price" }));
    const input = screen.getByPlaceholderText("e.g. 3200");
    expect(input).toHaveValue(3200);
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/share-link/tok1/asking-price",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ askingPrice: null }) })
    );
  });

  it("rejects a zero or negative asking price client-side, without ever calling fetch", async () => {
    const user = userEvent.setup();
    render(<ShareLinksList links={[links[1]]} bikeNames={bikeNames} appUrl={appUrl} />);

    await user.click(screen.getByRole("button", { name: "Add price" }));
    await user.type(screen.getByPlaceholderText("e.g. 3200"), "0");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(fetch).not.toHaveBeenCalled();
  });
});
