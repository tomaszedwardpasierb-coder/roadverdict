// Mirrors ShareLinksSection.test.tsx for the car equivalent component.
// The decide requests it drives go through the shared, now car-aware
// /api/tracker/receipt-request/[requestId]/decide route - the same
// endpoint the bike component posts to - so no car-specific decide URL
// appears here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CarReceiptRequestDocView, CarReceiptRequestItemView } from "@/lib/tracker/carReceiptRequest";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { CarShareLinksSection } from "@/app/dashboard/CarShareLinksSection";

function item(overrides: Partial<CarReceiptRequestItemView> & { entryId: string }): CarReceiptRequestItemView {
  return {
    category: "service",
    description: "Oil change",
    status: "pending",
    ...overrides,
  };
}

function request(overrides: Partial<CarReceiptRequestDocView> = {}): CarReceiptRequestDocView {
  return {
    id: "req1",
    pk: "owner@example.com",
    type: "carReceiptRequest",
    shareToken: "tok1",
    carId: "car-1",
    buyerEmail: "buyer@example.com",
    createdAt: "2024-06-01T10:00:00Z",
    decisionTokenHash: "hash",
    ttl: 1000,
    items: [item({ entryId: "e1" })],
    ...overrides,
  };
}

function decideCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.includes("/decide"));
}

const baseSectionProps = {
  links: [],
  carNames: {},
  appUrl: "https://roadverdict.example",
  currentMileage: 12345,
  distanceUnit: "mi" as const,
};

describe("CarShareLinksSection", () => {
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

  it("renders the car tag and rounded mileage pill from props", () => {
    render(
      <CarShareLinksSection
        {...baseSectionProps}
        requests={[]}
        carNickname="Steve"
        registration="AB12CDE"
      />
    );
    expect(screen.getByRole("heading", { name: "Shareable LinksSteve · AB12CDE" })).toBeInTheDocument();
    expect(screen.getByText("12,345 mi")).toBeInTheDocument();
  });

  it("hides the requests tab entirely when there are no pending requests", () => {
    render(<CarShareLinksSection {...baseSectionProps} requests={[]} />);
    expect(screen.queryByRole("button", { name: /Request for receipt access/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shareable links generated" })).toBeInTheDocument();
  });

  it("shows the requests tab with a count badge when requests are pending, and switches to it on click", async () => {
    const user = userEvent.setup();
    render(<CarShareLinksSection {...baseSectionProps} requests={[request()]} />);

    const requestsTab = screen.getByRole("button", { name: /Request for receipt access/ });
    expect(screen.getByLabelText("1 request waiting on you")).toBeInTheDocument();

    await user.click(requestsTab);
    expect(screen.getByText("1 receipt request waiting on you")).toBeInTheDocument();
  });

  it("falls back to the links tab if the requests tab is active and its last request gets removed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CarShareLinksSection {...baseSectionProps} requests={[request()]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    expect(screen.getByText(/receipt request.*waiting on you/)).toBeInTheDocument();

    rerender(<CarShareLinksSection {...baseSectionProps} requests={[]} />);
    expect(screen.queryByText(/receipt request.*waiting on you/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shareable links generated" })).toHaveClass(/tabActive|.+/);
  });

  it("labels a request by the buyer's email when known, or a generic label when not", async () => {
    const user = userEvent.setup();
    render(
      <CarShareLinksSection
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
      <CarShareLinksSection
        {...baseSectionProps}
        requests={[request({ buyerMessage: "Just want to double check the service history." })]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    expect(screen.getByText(/Just want to double check the service history\./)).toBeInTheDocument();
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
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    expect(screen.getByText("Still needs a decision")).toBeInTheDocument();
    expect(screen.getByText("Already decided")).toBeInTheDocument();
    expect(screen.getByText(/Asked again - you declined this on/)).toBeInTheDocument();
  });

  it("shows a no-preview tag for items with no attachment (requests made before previews existed)", async () => {
    const user = userEvent.setup();
    render(<CarShareLinksSection {...baseSectionProps} requests={[request({ items: [item({ entryId: "e1" })] })]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    expect(screen.getByText(/No preview/)).toBeInTheDocument();
  });

  it("typing a reason only shows the input once 'Don't share' is selected", async () => {
    const user = userEvent.setup();
    render(<CarShareLinksSection {...baseSectionProps} requests={[request({ items: [item({ entryId: "e1" })] })]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    expect(screen.queryByPlaceholderText(/Reason \(optional\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Don't share" }));
    expect(screen.getByPlaceholderText(/Reason \(optional\)/)).toBeInTheDocument();
  });

  it("save: only resends items whose decision actually changed this session, leaving unchanged decided items alone", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const req = request({
      items: [
        item({ entryId: "e1", status: "pending" }),
        item({ entryId: "e2", status: "approved" }),
        item({ entryId: "e3", status: "declined", reason: "no receipt" }),
      ],
    });
    const user = userEvent.setup();
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));

    const shareRadios = screen.getAllByRole("radio", { name: "Share" });
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
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
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
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
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
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    expect(await screen.findByText("1 of 2 decided")).toBeInTheDocument();
  });

  it("clicking the collapsed card expands it again", async () => {
    const req = request({ items: [item({ entryId: "e1", status: "approved" })] });
    const user = userEvent.setup();
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
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
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    await user.click(screen.getByRole("radio", { name: "Don't share" }));
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Please try again.");
    expect(screen.getByRole("button", { name: "Save decisions" })).toBeInTheDocument();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("a server error response on /decide (res.ok: false) shows an error and does not collapse or refresh", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes("/decide")) return { ok: false, json: async () => ({ error: "boom" }) };
      return { ok: true, json: async () => ({}) };
    });
    const req = request({ items: [item({ entryId: "e1", status: "pending" })] });
    const user = userEvent.setup();
    render(<CarShareLinksSection {...baseSectionProps} requests={[req]} />);
    await user.click(screen.getByRole("button", { name: /Request for receipt access/ }));
    await user.click(screen.getByRole("radio", { name: "Don't share" }));
    await user.click(screen.getByRole("button", { name: "Save decisions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save all decisions. Please try again.");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save decisions" })).toBeInTheDocument();
  });
});
