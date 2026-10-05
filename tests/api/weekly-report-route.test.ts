// The Monday report job: only runs with the cron secret, sends nothing until an
// address is configured, and sends the built report when one is.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAllUserAccounts: vi.fn(),
  gatherWeeklyReport: vi.fn(),
  buildWeeklyReport: vi.fn(),
  sendWeeklyReportEmail: vi.fn(),
}));
vi.mock("@/lib/tracker/userAccount", () => ({ getAllUserAccounts: mocks.getAllUserAccounts }));
vi.mock("@/lib/analytics/weeklyReport", () => ({ gatherWeeklyReport: mocks.gatherWeeklyReport, buildWeeklyReport: mocks.buildWeeklyReport }));
vi.mock("@/lib/resend", () => ({ sendWeeklyReportEmail: mocks.sendWeeklyReportEmail }));

import { POST } from "@/app/api/cron/weekly-report/route";

function req(auth?: string) {
  return new NextRequest("http://localhost/api/cron/weekly-report", { method: "POST", headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  process.env.CRON_SECRET = "s3cret";
  process.env.WEEKLY_REPORT_TO = "owner@example.com";
  mocks.getAllUserAccounts.mockResolvedValue([{ email: "a@example.com", createdAt: "2026-09-30T10:00:00Z", extra: "x" }]);
  mocks.gatherWeeklyReport.mockResolvedValue({ weekStart: "2026-09-28" });
  mocks.buildWeeklyReport.mockReturnValue({ subject: "RoadVerdict, week of 28 September", preheader: "p", bodyHtml: "<p>b</p>" });
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.WEEKLY_REPORT_TO;
});

describe("POST /api/cron/weekly-report", () => {
  it("refuses without the cron secret", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer wrong"))).status).toBe(401);
    expect(mocks.sendWeeklyReportEmail).not.toHaveBeenCalled();
  });

  it("sends nothing until WEEKLY_REPORT_TO is set", async () => {
    delete process.env.WEEKLY_REPORT_TO;
    const res = await POST(req("Bearer s3cret"));
    expect(await res.json()).toEqual({ ok: false, sent: false, reason: "WEEKLY_REPORT_TO isn't set." });
    expect(mocks.sendWeeklyReportEmail).not.toHaveBeenCalled();
  });

  it("builds the report from the accounts (email and sign-up date only) and sends it", async () => {
    const res = await POST(req("Bearer s3cret"));
    expect(await res.json()).toEqual({ ok: true, sent: true, subject: "RoadVerdict, week of 28 September" });
    expect(mocks.gatherWeeklyReport).toHaveBeenCalledWith([{ email: "a@example.com", createdAt: "2026-09-30T10:00:00Z" }]);
    expect(mocks.sendWeeklyReportEmail).toHaveBeenCalledWith("owner@example.com", { subject: "RoadVerdict, week of 28 September", preheader: "p", bodyHtml: "<p>b</p>" });
  });

  it("answers 500, without throwing, if the email fails", async () => {
    mocks.sendWeeklyReportEmail.mockRejectedValue(new Error("resend down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(req("Bearer s3cret"))).status).toBe(500);
  });
});
