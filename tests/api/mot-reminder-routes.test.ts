// The MOT reminder's three routes: the sign-up form, the confirmation link
// and the unsubscribe (button or an email client's one-click).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ request: vi.fn(), confirm: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/lib/mot/motReminders", () => ({
  requestMotReminder: mocks.request,
  confirmMotReminder: mocks.confirm,
  unsubscribeMotReminder: mocks.unsubscribe,
}));

import { POST as signUp } from "@/app/api/mot-reminder/route";
import { GET as confirm } from "@/app/api/mot-reminder/confirm/route";
import { POST as unsubscribe } from "@/app/api/mot-reminder/unsubscribe/route";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/mot-reminder", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": BROWSER, "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe("POST /api/mot-reminder", () => {
  it("passes the address, plate and visitor on, and says when the email has gone", async () => {
    mocks.request.mockResolvedValue({ status: "sent", motDueDate: "2027-03-12" });
    const res = await signUp(post({ email: "rider@example.com", registration: "YA16MTO" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "sent", motDueDate: "2027-03-12" });
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ email: "rider@example.com", registration: "YA16MTO", ip: "1.2.3.4" }));
  });

  it("explains each refusal, with 429 for the daily ceilings", async () => {
    mocks.request.mockResolvedValue({ status: "invalid_email" });
    const bad = await signUp(post({ email: "x", registration: "YA16MTO" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/email address/);

    mocks.request.mockResolvedValue({ status: "limit" });
    expect((await signUp(post({ email: "rider@example.com", registration: "YA16MTO" }))).status).toBe(429);
  });

  it("gives a bot that fills the hidden field the usual reply, and does nothing", async () => {
    const res = await signUp(post({ email: "rider@example.com", registration: "YA16MTO", website: "http://spam" }));
    expect(await res.json()).toEqual({ ok: true, status: "sent" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe("GET /api/mot-reminder/confirm", () => {
  it("switches the reminder on and shows where it stands", async () => {
    mocks.confirm.mockResolvedValue({ ok: true, registration: "YA16MTO", motDueDate: "2027-03-12" });
    const res = await confirm(new NextRequest("http://localhost/api/mot-reminder/confirm?r=abc&t=secret"));
    expect(mocks.confirm).toHaveBeenCalledWith("abc", "secret");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/mot-check\/reminder\?status=confirmed&vrm=YA16MTO&due=2027-03-12$/);
  });

  it("sends a bad or expired link to the expired message", async () => {
    mocks.confirm.mockResolvedValue({ ok: false });
    const res = await confirm(new NextRequest("http://localhost/api/mot-reminder/confirm?r=abc&t=nope"));
    expect(res.headers.get("location")).toMatch(/status=invalid$/);
  });
});

describe("POST /api/mot-reminder/unsubscribe", () => {
  it("stops reminders from the page's button and shows that they've stopped", async () => {
    mocks.unsubscribe.mockResolvedValue(true);
    const form = new URLSearchParams({ r: "abc", t: "unsub" });
    const res = await unsubscribe(
      new NextRequest("http://localhost/api/mot-reminder/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      })
    );
    expect(mocks.unsubscribe).toHaveBeenCalledWith("abc", "unsub");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/status=unsubscribed$/);
  });

  it("answers an email client's one-click unsubscribe with a plain 200", async () => {
    mocks.unsubscribe.mockResolvedValue(true);
    const res = await unsubscribe(
      new NextRequest("http://localhost/api/mot-reminder/unsubscribe?r=abc&t=unsub", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      })
    );
    expect(mocks.unsubscribe).toHaveBeenCalledWith("abc", "unsub");
    expect(res.status).toBe(200);
  });
});
