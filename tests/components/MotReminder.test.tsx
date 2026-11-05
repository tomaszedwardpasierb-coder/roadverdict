// The free MOT check result's two asks (5 Nov 2026) - the no-account MOT
// reminder form and the one-question poll - and the page the reminder's
// email links land on.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MotRecord } from "@/lib/mot/motRecord";

const findForUnsubscribe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mot/motReminders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mot/motReminders")>("@/lib/mot/motReminders");
  return { ...actual, findMotReminderForUnsubscribe: findForUnsubscribe };
});

import { MotCheckResult } from "@/app/mot-check/MotCheckResult";
import { MotReminderForm } from "@/app/mot-check/MotReminderForm";
import { MotIntentPoll } from "@/app/mot-check/MotIntentPoll";
import MotReminderPage from "@/app/mot-check/reminder/page";

const NOW = new Date("2026-11-05T12:00:00Z");

const car: MotRecord = {
  registration: "AB12CDE",
  make: "FORD",
  model: "FOCUS",
  fuelType: "PETROL",
  colour: "GREY",
  motDueDate: "2027-03-12",
  kind: "car",
  source: "dvsa",
  tests: [{ date: "2026-03-13T10:00:00", passed: true, mileage: 52000, expiryDate: "2027-03-12", defects: [] }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  findForUnsubscribe.mockReset();
  sessionStorage.clear();
});

describe("on the MOT check result", () => {
  it("offers the reminder for an MOT that's still valid, saying when it will come", () => {
    render(<MotCheckResult record={car} now={NOW} />);
    expect(screen.getByLabelText("Email me before this MOT is due")).toBeInTheDocument();
    expect(screen.getByText(/On 12 February 2027, 4 weeks before, with what its last MOT flagged/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Is this your own vehicle, or one you’re thinking of buying?" })).toBeInTheDocument();
  });

  it("says the reminder comes within a day when the MOT is due in under 4 weeks", () => {
    render(<MotCheckResult record={{ ...car, motDueDate: "2026-11-20" }} now={NOW} />);
    expect(screen.getByText(/Within a day, as it’s due in under 4 weeks,/)).toBeInTheDocument();
  });

  it("has no reminder for an MOT that has already run out, but still asks the question", () => {
    render(<MotCheckResult record={{ ...car, motDueDate: "2026-10-01" }} now={NOW} />);
    expect(screen.queryByLabelText("Email me before this MOT is due")).toBeNull();
    expect(screen.getByRole("button", { name: "Thinking of buying it" })).toBeInTheDocument();
  });
});

describe("MotReminderForm", () => {
  it("posts the address and plate, then says to confirm from the email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: "sent" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<MotReminderForm registration="AB12CDE" when="On 12 February 2027, 4 weeks before," />);
    fireEvent.change(screen.getByLabelText("Email me before this MOT is due"), { target: { value: "driver@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Remind me" }));
    expect(await screen.findByRole("status")).toHaveTextContent("we’ve emailed driver@example.com a link to confirm");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "driver@example.com", registration: "AB12CDE", website: "" });
  });

  it("shows the server's reason when it refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Too many reminder requests today." }) }));
    render(<MotReminderForm registration="AB12CDE" when="On 12 February 2027, 4 weeks before," />);
    fireEvent.change(screen.getByLabelText("Email me before this MOT is due"), { target: { value: "driver@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Remind me" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many reminder requests today.");
  });
});

describe("MotIntentPoll", () => {
  it("counts a buyer's answer once and points them to the history check", async () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    render(<MotIntentPoll registration="AB12CDE" historyHref="/cars/buying-guide?src=mot" hasReminder />);
    fireEvent.click(screen.getByRole("button", { name: "Thinking of buying it" }));
    expect(beacon).toHaveBeenCalledWith("/api/funnel", JSON.stringify({ step: "mot_poll_buying" }));
    expect(screen.getByRole("link", { name: "the full history check does" })).toHaveAttribute("href", "/cars/buying-guide?src=mot");
    expect(screen.queryByRole("button", { name: "It’s mine" })).toBeNull();
    expect(sessionStorage.getItem("mot-poll::AB12CDE")).toBe("buying");
  });

  it("points an owner to the reminder", () => {
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: vi.fn().mockReturnValue(true) });
    render(<MotIntentPoll registration="AB12CDE" historyHref="/cars/buying-guide?src=mot" hasReminder />);
    fireEvent.click(screen.getByRole("button", { name: "It’s mine" }));
    expect(screen.getByRole("link", { name: "Set the MOT reminder" })).toHaveAttribute("href", "#mot-reminder");
  });

  it("doesn't ask again in the same tab", async () => {
    sessionStorage.setItem("mot-poll::AB12CDE", "mine");
    render(<MotIntentPoll registration="AB12CDE" historyHref="/cars/buying-guide?src=mot" hasReminder={false} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "It’s mine" })).toBeNull());
  });
});

describe("the reminder link page", () => {
  const show = async (params: Record<string, string>) => render(await MotReminderPage({ searchParams: Promise.resolve(params) }));

  it("confirms the reminder with its date", async () => {
    await show({ status: "confirmed", vrm: "AB12CDE", due: "2027-03-12" });
    expect(screen.getByRole("heading", { name: "Your MOT reminder is on" })).toBeInTheDocument();
    expect(screen.getByText(/We’ll email you on 12 February 2027, 4 weeks before the MOT on/)).toBeInTheDocument();
  });

  it("asks before stopping anything, posting the link's secret", async () => {
    findForUnsubscribe.mockResolvedValue({ ok: true, registration: "AB12CDE", motDueDate: "2027-03-12" });
    const { container } = await show({ unsubscribe: "a".repeat(40), t: "unsub" });
    expect(findForUnsubscribe).toHaveBeenCalledWith("a".repeat(40), "unsub");
    expect(screen.getByRole("button", { name: "Stop reminders" })).toBeInTheDocument();
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("action", "/api/mot-reminder/unsubscribe");
    expect(form).toHaveAttribute("method", "post");
    expect(container.querySelector('input[name="t"]')).toHaveValue("unsub");
  });

  it("says there's nothing to stop for a link that matches nothing", async () => {
    findForUnsubscribe.mockResolvedValue({ ok: false });
    await show({ unsubscribe: "a".repeat(40), t: "wrong" });
    expect(screen.getByRole("heading", { name: "Nothing to stop" })).toBeInTheDocument();
  });

  it("shows the expired message for anything else", async () => {
    await show({ status: "invalid" });
    expect(screen.getByRole("heading", { name: "That link has expired" })).toBeInTheDocument();
  });
});
