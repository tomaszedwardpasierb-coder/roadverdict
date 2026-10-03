// The public demo's two live steps: reading a receipt, and answering a question.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  takeDemoUse: vi.fn(),
  parseReceiptFile: vi.fn(),
  callGeminiForJson: vi.fn(),
  recordFunnelStep: vi.fn(),
}));

vi.mock("@/lib/demo/demoUsage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/demo/demoUsage")>("@/lib/demo/demoUsage");
  return { ...actual, takeDemoUse: mocks.takeDemoUse };
});
vi.mock("@/lib/tracker/receiptParse", () => ({ parseReceiptFile: mocks.parseReceiptFile }));
vi.mock("@/lib/tracker/geminiJsonCall", () => ({ callGeminiForJson: mocks.callGeminiForJson }));
vi.mock("@/lib/analytics/funnel", async () => {
  const pure = await vi.importActual<typeof import("@/lib/analytics/funnelSource")>("@/lib/analytics/funnelSource");
  return { ...pure, recordFunnelStep: mocks.recordFunnelStep };
});

import { POST as scan } from "@/app/api/demo/scan/route";
import { POST as ask } from "@/app/api/demo/ask/route";

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1";

function scanRequest(file: File | null, userAgent = PHONE): NextRequest {
  const body = new FormData();
  if (file) body.append("file", file);
  return new NextRequest("http://localhost/api/demo/scan", { method: "POST", headers: { "user-agent": userAgent }, body });
}
function askRequest(body: unknown, userAgent = PHONE): NextRequest {
  return new NextRequest("http://localhost/api/demo/ask", {
    method: "POST",
    headers: { "user-agent": userAgent, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.DEMO_ENABLED;
  mocks.takeDemoUse.mockResolvedValue("ok");
});

describe("POST /api/demo/scan", () => {
  const receipt = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
  const item = {
    category: "service",
    date: "2026-09-24",
    costGbp: 199,
    description: "Full service",
    litres: null,
    mileageOnReceipt: 12480,
    merchantName: "Riverside Moto Services",
    attachment: { blobName: "" },
    forceReview: false,
  };

  it("reads a receipt without storing it, and returns only the readable details", async () => {
    mocks.parseReceiptFile.mockResolvedValue({ ok: true, summary: "Service", items: [item] });
    const res = await scan(scanRequest(receipt));
    expect(res.status).toBe(200);
    expect(mocks.parseReceiptFile.mock.calls[0][3]).toEqual({ store: false, escalate: false });
    const data = await res.json();
    expect(data.items[0]).toEqual({
      category: "service",
      date: "2026-09-24",
      costGbp: 199,
      description: "Full service",
      litres: null,
      mileageOnReceipt: 12480,
      merchantName: "Riverside Moto Services",
    });
    expect(JSON.stringify(data)).not.toContain("attachment");
    expect(mocks.recordFunnelStep).toHaveBeenCalledWith("demo_scanned");
  });

  it("refuses over-limit visitors before any AI call", async () => {
    mocks.takeDemoUse.mockResolvedValue("visitor_limit");
    const res = await scan(scanRequest(receipt));
    expect(res.status).toBe(429);
    expect(mocks.parseReceiptFile).not.toHaveBeenCalled();
  });

  it("refuses bots, a missing file, and everyone when switched off", async () => {
    expect((await scan(scanRequest(receipt, "Googlebot/2.1"))).status).toBe(403);
    expect((await scan(scanRequest(null))).status).toBe(400);
    process.env.DEMO_ENABLED = "false";
    expect((await scan(scanRequest(receipt))).status).toBe(503);
    expect(mocks.parseReceiptFile).not.toHaveBeenCalled();
  });

  it("passes on the reader's own reason when it can't read the file", async () => {
    mocks.parseReceiptFile.mockResolvedValue({ ok: false, error: "This doesn't look like a receipt.", status: 422 });
    const res = await scan(scanRequest(receipt));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("doesn't look like a receipt");
    expect(mocks.recordFunnelStep).not.toHaveBeenCalled();
  });
});

describe("POST /api/demo/ask", () => {
  it("answers from the sample bike's figures, plus a cleaned copy of the visitor's receipt", async () => {
    mocks.callGeminiForJson.mockImplementation(async (_s: string, facts: string, _k: string, validate: (p: unknown) => unknown) => {
      expect(facts).toContain("Total spent:");
      expect(facts).toContain("Full service");
      expect(facts).toContain("QUESTION: What did I spend on servicing?");
      return validate({ answer: "  £668 on servicing.  " });
    });
    const res = await ask(
      askRequest({
        question: "What did I spend on servicing?",
        scanned: [
          { category: "service", date: "2026-09-24", cost: 199, description: "Full service" },
          { category: "nonsense", date: "2026-09-24", cost: 5, description: "bad category" },
          { category: "service", date: "yesterday", cost: 5, description: "bad date" },
          { category: "service", date: "2026-09-24", cost: 999999, description: "absurd cost" },
        ],
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "£668 on servicing." });
    expect(mocks.recordFunnelStep).toHaveBeenCalledWith("demo_asked");
    const facts = mocks.callGeminiForJson.mock.calls[0][1] as string;
    expect(facts).not.toContain("bad category");
    expect(facts).not.toContain("absurd cost");
  });

  it("refuses an empty or over-long question, an over-limit visitor and bots", async () => {
    expect((await ask(askRequest({ question: "  " }))).status).toBe(400);
    expect((await ask(askRequest({ question: "x".repeat(201) }))).status).toBe(400);
    expect((await ask(askRequest({ question: "hello" }, "curl/8.0"))).status).toBe(403);
    mocks.takeDemoUse.mockResolvedValue("site_limit");
    expect((await ask(askRequest({ question: "hello" }))).status).toBe(429);
    expect(mocks.callGeminiForJson).not.toHaveBeenCalled();
  });

  it("says so, rather than guessing, when the AI can't answer", async () => {
    mocks.callGeminiForJson.mockResolvedValue(null);
    const res = await ask(askRequest({ question: "When is my MOT?" }));
    expect(res.status).toBe(502);
    expect(mocks.recordFunnelStep).not.toHaveBeenCalled();
  });
});
