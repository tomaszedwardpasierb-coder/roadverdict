// Place at: tests/components/AssistantProposedShareLinkCard.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AssistantProposedShareLinkCard, type ProposedShareLink } from "@/components/AssistantProposedShareLinkCard";

const bikeLink: ProposedShareLink = {
  category: "shareLink",
  vehicleKind: "bike",
  duration: "1month",
  recipientEmail: "buyer@example.com",
};

const carLink: ProposedShareLink = {
  category: "shareLink",
  vehicleKind: "car",
  duration: "1week",
  recipientEmail: "",
  askingPrice: 3200,
};

describe("AssistantProposedShareLinkCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    refresh.mockClear();
    // Deliberately not stubbing navigator.clipboard ourselves - see
    // ExportShareSection.test.tsx's own comment: @testing-library/
    // user-event's setup() unconditionally installs its own real
    // (in-memory) Clipboard stub the moment it runs, overwriting
    // anything defined beforehand.
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pre-fills the recipient email, duration, and asking price from the draft", () => {
    render(<AssistantProposedShareLinkCard link={carLink} />);
    expect(screen.getByLabelText(/Sharing with/)).toHaveValue("");
    expect(screen.getByLabelText("Valid for")).toHaveValue("1week");
    expect(screen.getByLabelText(/Asking price/)).toHaveValue(3200);
  });

  it("rejects confirming with no recipient email, without calling fetch", async () => {
    const user = userEvent.setup();
    render(<AssistantProposedShareLinkCard link={carLink} />);
    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/email address/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a bike link, posting to the bike share-link endpoint, and shows the resulting URL with a copy button", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://roadverdict.co.uk/report/tok123", expiresAt: "2026-02-01" }) });
    const user = userEvent.setup();
    render(<AssistantProposedShareLinkCard link={bikeLink} />);

    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByText("✓ Link created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://roadverdict.co.uk/report/tok123")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/share-link",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ duration: "1month", recipientEmail: "buyer@example.com", askingPrice: undefined }) })
    );
    expect(refresh).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("https://roadverdict.co.uk/report/tok123");
  });

  it("creates a car link by posting to the car share-link endpoint, once the recipient email is filled in", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://roadverdict.co.uk/car-report/tok456" }) });
    const user = userEvent.setup();
    render(<AssistantProposedShareLinkCard link={carLink} />);

    await user.type(screen.getByLabelText(/Sharing with/), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByText("✓ Link created")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-share-link",
      expect.objectContaining({ body: JSON.stringify({ duration: "1week", recipientEmail: "someone@example.com", askingPrice: 3200 }) })
    );
  });

  it("shows the server's own error message and stays editable rather than showing a link", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "No bike found for this account." }) });
    const user = userEvent.setup();
    render(<AssistantProposedShareLinkCard link={bikeLink} />);

    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByText("No bike found for this account.")).toBeInTheDocument();
    expect(screen.queryByText("✓ Link created")).not.toBeInTheDocument();
  });
});
