// Place at: tests/components/ShareLinksSection.test.tsx
//
// ShareLinksSection is the container for the dashboard's "Shareable
// Links" tab. Its own logic (as opposed to its children's - ExportShareSection
// and ShareLinksList each have, or will have, their own dedicated tests)
// is: the links/requests sub-tab switcher (including falling back to
// "links" once the last pending request is handled while "requests" is
// active), the header's bike tag and mileage pill, and RequestCard's
// per-item approve/decline/revert-to-pending flow - including which
// items actually get resent to the server (only ones whose decision
// changed this session) and the reason field that only applies to
// declines. Only `fetch` and next/navigation's useRouter are mocked;
// NotificationBell (rendered unconditionally in the header) makes its
// own real fetch call on mount, handled generically by the same mock.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReceiptRequestDocView, ReceiptRequestItemView } from "@/lib/tracker/receiptRequest";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { ShareLinksSection } from "@/app/dashboard/ShareLinksSection";

function item(overrides: Partial<ReceiptRequestItemView> & { entryId: string }): ReceiptRequestItemView {
  return {
    category: "service",
    description: "Oil change",
    status: "pending",
    ...overrides,
  };
}

function request(overrides: Partial<ReceiptRequestDocView> = {}): ReceiptRequestDocView {
  return {
    id: "req1",
    pk: "owner@example.com",
    type: "receiptRequest",
    shareToken: "tok1",
    bikeId: "bike-1",
    buyerEmail: "buyer@example.com",
    createdAt: "2024-06-01T10:00:00Z",
    decisionTokenHash: "hash",
    ttl: 1000,
    items: [item({ entryId: "e1" })],
    ...overrides,
  };
}

/** Distinguishes RequestCard's own decide calls from NotificationBell's
 *  unconditional mount-time fetch, so assertions on "what did the decide
 *  endpoint receive" aren't tripped up by an unrelated call. */
function decideCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.includes("/decide"));
}

const baseSectionProps = {
  links: [],
  bikeNames: {},
  appUrl: "https://roadverdict.example",
  currentMileage: 12345,
  distanceUnit: "mi" as const,
};

describe("ShareLinksSection", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the bike tag and rounded mileage pill from props", () => {
    render(
      <ShareLinksSection
        {...baseSectionProps}
        requests={[]}
        bikeNickname="Steve"
        registration="AB12CDE"
      />
    );
    expect(screen.getByRole("heading", { name: "Shareable LinksSteve · AB12CDE" })).toBeInTheDocument();
    expect(screen.getByText("12,345 mi")).toBeInTheDocument();
  });

  it("hides the requests tab entirely when there are no pending requests", () => {
    render(<ShareLinksSection {...baseSectionProps} requests={[]} />);
    expect(screen.queryByRole("button", { name: /Request for receipt access/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shareable links generated" })).toBeInTheDocument();
  });

  it("shows the requests tab with a count badge when requests are pending, and switches to it on click", async () => {
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[request()]} />);

    const requestsTab = screen.getByRole("button", { name: /Request for receipt access/ });
    expect(screen.getByLabelText("1 request waiting on you")).toBeInTheDocument();

    await user.click(requestsTab);
    expect(screen.getByText("1 receipt request waiting on you")).toBeInTheDocument();
  });

  it("falls back to the links tab if the requests tab is active and its last request gets removed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShareLinksSection {...baseSectionProps} requests={[request()]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    expect(screen.getByText(/receipt request.*waiting on you/)).toBeInTheDocument();

    rerender(<ShareLinksSection {...baseSectionProps} requests={[]} />);
    expect(screen.queryByText(/receipt request.*waiting on you/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shareable links generated" })).toHaveClass(/tabActive|.+/);
  });

  it("labels a request by the buyer's email when known, or a generic label when not", async () => {
    const user = userEvent.setup();
    render(
      <ShareLinksSection
        {...baseSectionProps}
        requests={[request({ id: "req1", buyerEmail: "buyer@example.com" }), request({ id: "req2", buyerEmail: undefined })]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    expect(screen.getByText(/From buyer@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/From a buyer viewing your report/)).toBeInTheDocument();
  });

  it("shows the buyer's message when present", async () => {
    const user = userEvent.setup();
    render(
      <ShareLinksSection
        {...baseSectionProps}
        requests={[request({ buyerMessage: "Just want to double check the chain history." })]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    expect(screen.getByText(/Just want to double check the chain history\./)).toBeInTheDocument();
  });

  it("separates still-pending items from already-decided ones, and flags a prior decline", async () => {
    const user = userEvent.setup();
    const req = request({
      items: [
        item({ entryId: "e1", description: "Oil change", status: "pending" }),
        item({ entryId: "e2", description: "Brake pads", status: "approved" }),
        item({
          entryId: "e3",
          description: "Tyres",
          status: "pending",
          priorDecline: { decidedAt: "2024-01-15T00:00:00Z" },
        }),
      ],
    });
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    expect(screen.getByText("Still needs a decision")).toBeInTheDocument();
    expect(screen.getByText("Already decided")).toBeInTheDocument();
    expect(screen.getByText(/Asked again - you declined this on/)).toBeInTheDocument();
  });

  it("shows a no-preview tag for items with no attachment (requests made before previews existed)", async () => {
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[request({ items: [item({ entryId: "e1" })] })]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    expect(screen.getByText(/No preview/)).toBeInTheDocument();
  });

  it("typing a reason only shows the input once 'Don't share' is selected", async () => {
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[request({ items: [item({ entryId: "e1" })] })]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    expect(screen.queryByPlaceholderText(/Reason \(optional\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Don't share" }));
    expect(screen.getByPlaceholderText(/Reason \(optional\)/)).toBeInTheDocument();
  });

  it("save: only resends items whose decision actually changed this session, leaving unchanged decided items alone", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const req = request({
      items: [
        item({ entryId: "e1", status: "pending" }), // stays pending -> not sent
        item({ entryId: "e2", status: "approved" }), // stays approved -> not sent
        item({ entryId: "e3", status: "declined", reason: "no receipt" }), // -> approved this session
      ],
    });
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    // e3 is in the "Already decided" group; its radios share option labels
    // with every other item, so scope the query to its own row via the
    // description text that's unique to it in this fixture.
    const shareRadios = screen.getAllByRole("radio", { name: "Share" });
    // e1 (pending, first radio group) is index 0's "Share"; e3 is the last
    // rendered row (already-decided group renders after still-pending).
    await user.click(shareRadios[shareRadios.length - 1]);

    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    await vi.waitFor(() => expect(decideCalls(fetchMock).length).toBe(1));
    const [, options] = decideCalls(fetchMock)[0];
    expect(JSON.parse(options.body)).toEqual({ entryIds: ["e3"], decision: "approved" });
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("save: a pending->declined change is sent with its typed reason", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const req = request({ items: [item({ entryId: "e1", status: "pending" })] });
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    await user.click(screen.getByRole("radio", { name: "Don't share" }));
    await user.type(screen.getByPlaceholderText(/Reason \(optional\)/), "No documentation available");
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    await vi.waitFor(() => expect(decideCalls(fetchMock).length).toBe(1));
    const [, options] = decideCalls(fetchMock)[0];
    expect(JSON.parse(options.body)).toEqual({
      entryIds: ["e1"],
      decision: "declined",
      reason: "No documentation available",
    });
  });

  it("save: reverting an approved item back to pending sends it as a 'pending' decision", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const req = request({ items: [item({ entryId: "e2", status: "approved" })] });
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    await user.click(screen.getByRole("radio", { name: "Not yet" }));
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    await vi.waitFor(() => expect(decideCalls(fetchMock).length).toBe(1));
    const [, options] = decideCalls(fetchMock)[0];
    expect(JSON.parse(options.body)).toEqual({ entryIds: ["e2"], decision: "pending" });
  });

  it("collapses the card and shows a decided tally after a successful save", async () => {
    const req = request({
      items: [item({ entryId: "e1", status: "pending" }), item({ entryId: "e2", status: "approved" })],
    });
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    expect(await screen.findByText("1 of 2 decided")).toBeInTheDocument();
  });

  it("clicking the collapsed card expands it again", async () => {
    const req = request({ items: [item({ entryId: "e1", status: "approved" })] });
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    await user.click(screen.getByRole("button", { name: "Collapse" }));

    expect(screen.getByText(/decided/)).toBeInTheDocument();
    await user.click(screen.getByText(/decided/).closest("button")!);
    expect(screen.getByRole("button", { name: "Save decisions" })).toBeInTheDocument();
  });

  it("shows an error and stays expanded if the decide request throws (e.g. a network failure)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("/decide")) throw new Error("network down");
      return { ok: true, json: async () => ({}) };
    });
    const req = request({ items: [item({ entryId: "e1", status: "pending" })] });
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    await user.click(screen.getByRole("radio", { name: "Don't share" }));
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Please try again.");
    expect(screen.getByRole("button", { name: "Save decisions" })).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  // BUG: save() never checks res.ok on the /decide responses - only a
  // thrown fetch (a real network failure) is treated as a failure. A
  // real server-side error response (400/500, res.ok === false) is
  // silently treated as success: the card still collapses and
  // router.refresh() still runs, with no error ever shown to the owner
  // even though nothing was actually saved.
  it("BUG: a server error response on /decide (res.ok: false) is currently swallowed as if it saved successfully", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("/decide")) return { ok: false, json: async () => ({ error: "boom" }) };
      return { ok: true, json: async () => ({}) };
    });
    const req = request({ items: [item({ entryId: "e1", status: "pending" })] });
    const user = userEvent.setup();
    render(<ShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    await user.click(screen.getByRole("radio", { name: "Don't share" }));
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    // Documents current (arguably buggy) behaviour rather than desired
    // behaviour - no error shown, and the card collapses as if it worked.
    await vi.waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
