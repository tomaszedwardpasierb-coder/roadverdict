import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Resend: vi.fn(),
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: mocks.Resend,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.Resend.mockReset();
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  mocks.Resend.mockImplementation(function () {
    return { emails: { send: mocks.send } };
  });
  process.env.RESEND_API_KEY = "test-resend-key";
  delete process.env.APP_URL;
});

const bikeSummary = { make: "Honda", model: "CB500F", year: 2021, isCustomBuild: false };
const customBikeSummary = { make: "Franken", model: "Special", isCustomBuild: true };

describe("getResend lazy singleton (exercised via every send* function)", () => {
  it("throws when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendMagicLinkEmail } = await import("@/lib/resend");
    await expect(sendMagicLinkEmail("rider@example.com", "https://x/link")).rejects.toThrow(
      "Missing RESEND_API_KEY environment variable"
    );
    expect(mocks.Resend).not.toHaveBeenCalled();
  });

  it("constructs the Resend client with the API key", async () => {
    const { sendMagicLinkEmail } = await import("@/lib/resend");
    await sendMagicLinkEmail("rider@example.com", "https://x/link");
    expect(mocks.Resend).toHaveBeenCalledWith("test-resend-key");
  });

  it("reuses the same client across multiple send calls", async () => {
    const { sendMagicLinkEmail } = await import("@/lib/resend");
    await sendMagicLinkEmail("a@example.com", "https://x/1");
    await sendMagicLinkEmail("b@example.com", "https://x/2");
    expect(mocks.Resend).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});

describe("sendMagicLinkEmail", () => {
  it("sends from the RoadVerdict noreply address to the given email", async () => {
    const { sendMagicLinkEmail } = await import("@/lib/resend");
    await sendMagicLinkEmail("rider@example.com", "https://app/link?token=abc");
    const call = mocks.send.mock.calls[0][0];
    expect(call.from).toBe("RoadVerdict <noreply@mail.roadverdict.co.uk>");
    expect(call.to).toBe("rider@example.com");
    expect(call.subject).toBe("Your RoadVerdict sign-in link");
  });

  it("embeds the sign-in link as an href", async () => {
    const { sendMagicLinkEmail } = await import("@/lib/resend");
    await sendMagicLinkEmail("rider@example.com", "https://app/link?token=abc&x=1");
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain('href="https://app/link?token=abc&x=1"');
  });
});

describe("sendReminderEmail", () => {
  it("escapes HTML in the reminder name and detail", async () => {
    const { sendReminderEmail } = await import("@/lib/resend");
    await sendReminderEmail("rider@example.com", "<b>Oil change</b>", 'due at "5000" miles & <now>');
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain("&lt;b&gt;Oil change&lt;/b&gt;");
    expect(html).toContain("due at &quot;5000&quot; miles &amp; &lt;now&gt;");
    expect(html).not.toContain("<b>Oil change</b>");
  });

  it("includes the unescaped reminder name in the subject", async () => {
    const { sendReminderEmail } = await import("@/lib/resend");
    await sendReminderEmail("rider@example.com", "Oil change", "detail");
    expect(mocks.send.mock.calls[0][0].subject).toBe("Reminder: Oil change is due");
  });

  it("defaults APP_URL to the production domain when unset", async () => {
    const { sendReminderEmail } = await import("@/lib/resend");
    await sendReminderEmail("rider@example.com", "Oil change", "detail");
    expect(mocks.send.mock.calls[0][0].html).toContain("https://roadverdict.co.uk/dashboard");
  });

  it("uses APP_URL when set", async () => {
    process.env.APP_URL = "https://staging.roadverdict.co.uk";
    const { sendReminderEmail } = await import("@/lib/resend");
    await sendReminderEmail("rider@example.com", "Oil change", "detail");
    expect(mocks.send.mock.calls[0][0].html).toContain("https://staging.roadverdict.co.uk/dashboard");
  });
});

describe("sendReceiptRequestEmail", () => {
  const baseParams = {
    ownerEmail: "owner@example.com",
    bikeName: "2021 Honda CB500F",
    items: [{ description: "Front brake pads" }, { description: "<script>steal()</script>" }],
    decisionToken: "tok-123",
  };

  it("lists escaped item descriptions", async () => {
    const { sendReceiptRequestEmail } = await import("@/lib/resend");
    await sendReceiptRequestEmail(baseParams);
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain("<li>Front brake pads</li>");
    expect(html).toContain("<li>&lt;script&gt;steal()&lt;/script&gt;</li>");
  });

  it("includes approve, decline, and review links carrying the decision token", async () => {
    const { sendReceiptRequestEmail } = await import("@/lib/resend");
    await sendReceiptRequestEmail(baseParams);
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain("token=tok-123&action=approve");
    expect(html).toContain("token=tok-123&action=decline");
    expect(html).toContain("token=tok-123");
  });

  it("omits the buyer note paragraph when no buyerMessage is given", async () => {
    const { sendReceiptRequestEmail } = await import("@/lib/resend");
    await sendReceiptRequestEmail(baseParams);
    expect(mocks.send.mock.calls[0][0].html).not.toContain("They added a note");
  });

  it("includes an escaped buyer note when buyerMessage is given", async () => {
    const { sendReceiptRequestEmail } = await import("@/lib/resend");
    await sendReceiptRequestEmail({ ...baseParams, buyerMessage: "Can I see the <invoice>?" });
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain('They added a note: "Can I see the &lt;invoice&gt;?"');
  });

  it("uses the non-reminder subject by default", async () => {
    const { sendReceiptRequestEmail } = await import("@/lib/resend");
    await sendReceiptRequestEmail(baseParams);
    expect(mocks.send.mock.calls[0][0].subject).toBe("Receipt request for 2021 Honda CB500F");
  });

  it("uses the reminder subject and wording when isReminder is true", async () => {
    const { sendReceiptRequestEmail } = await import("@/lib/resend");
    await sendReceiptRequestEmail({ ...baseParams, isReminder: true });
    expect(mocks.send.mock.calls[0][0].subject).toBe("Reminder: receipt request for 2021 Honda CB500F");
    expect(mocks.send.mock.calls[0][0].html).toContain("A reminder that someone");
  });
});

describe("sendShareLinkEmail", () => {
  it("escapes the bike name and expiry label, and links to the report", async () => {
    const { sendShareLinkEmail } = await import("@/lib/resend");
    await sendShareLinkEmail(
      "buyer@example.com",
      "<b>Ducati</b> Monster",
      "https://app/report/xyz",
      '1 Jan 2027 <UTC>'
    );
    const call = mocks.send.mock.calls[0][0];
    expect(call.to).toBe("buyer@example.com");
    expect(call.subject).toBe("Ownership report for <b>Ducati</b> Monster");
    expect(call.html).toContain("&lt;b&gt;Ducati&lt;/b&gt; Monster");
    expect(call.html).toContain('href="https://app/report/xyz"');
    expect(call.html).toContain("1 Jan 2027 &lt;UTC&gt;");
  });
});

describe("formatBikeName (exercised via the transfer/ownership emails)", () => {
  it("prefixes with the year for a normal bike", async () => {
    const { sendBikeTransferOfferEmail } = await import("@/lib/resend");
    await sendBikeTransferOfferEmail({
      recipientEmail: "buyer@example.com",
      ownerEmail: "seller@example.com",
      bikeSummary,
      token: "tok-abc",
    });
    expect(mocks.send.mock.calls[0][0].subject).toContain("2021 Honda CB500F");
  });

  it("prefixes with 'Custom build' when isCustomBuild is true, ignoring any year", async () => {
    const { sendBikeTransferOfferEmail } = await import("@/lib/resend");
    await sendBikeTransferOfferEmail({
      recipientEmail: "buyer@example.com",
      ownerEmail: "seller@example.com",
      bikeSummary: customBikeSummary,
      token: "tok-abc",
    });
    expect(mocks.send.mock.calls[0][0].subject).toContain("Custom build Franken Special");
  });

  it("omits any prefix when there is no year and it is not a custom build", async () => {
    const { sendBikeTransferOfferEmail } = await import("@/lib/resend");
    await sendBikeTransferOfferEmail({
      recipientEmail: "buyer@example.com",
      ownerEmail: "seller@example.com",
      bikeSummary: { make: "Honda", model: "CB500F", isCustomBuild: false },
      token: "tok-abc",
    });
    expect(mocks.send.mock.calls[0][0].subject).toContain("Honda CB500F");
    expect(mocks.send.mock.calls[0][0].subject).not.toContain("undefined");
  });
});

describe("sendBikeTransferOfferEmail", () => {
  it("addresses the recipient, names the owner, and links to the offer with the token", async () => {
    const { sendBikeTransferOfferEmail } = await import("@/lib/resend");
    await sendBikeTransferOfferEmail({
      recipientEmail: "buyer@example.com",
      ownerEmail: "seller@example.com",
      bikeSummary,
      token: "tok-abc",
    });
    const call = mocks.send.mock.calls[0][0];
    expect(call.to).toBe("buyer@example.com");
    expect(call.subject).toBe("seller@example.com wants to hand you the RoadVerdict record for a 2021 Honda CB500F");
    expect(call.html).toContain("https://roadverdict.co.uk/bike-transfer/tok-abc");
  });
});

describe("sendBikeTransferAcceptedEmail", () => {
  it("notifies the owner naming the recipient who accepted", async () => {
    const { sendBikeTransferAcceptedEmail } = await import("@/lib/resend");
    await sendBikeTransferAcceptedEmail({
      ownerEmail: "seller@example.com",
      recipientEmail: "buyer@example.com",
      bikeSummary,
    });
    const call = mocks.send.mock.calls[0][0];
    expect(call.to).toBe("seller@example.com");
    expect(call.subject).toBe("buyer@example.com accepted the handover for your 2021 Honda CB500F");
  });
});

describe("sendHistoryFollowUpEmail", () => {
  it("links to the provided report URL and names the bike", async () => {
    const { sendHistoryFollowUpEmail } = await import("@/lib/resend");
    await sendHistoryFollowUpEmail({
      recipientEmail: "buyer@example.com",
      bikeSummary,
      reportUrl: "https://app/report/detailed/abc",
    });
    const call = mocks.send.mock.calls[0][0];
    expect(call.to).toBe("buyer@example.com");
    expect(call.html).toContain('href="https://app/report/detailed/abc"');
    expect(call.subject).toBe("Bought the 2021 Honda CB500F? Keep its history alive");
  });
});

describe("sendIncomingOwnershipRequestEmail", () => {
  it("names the requester and links to the dashboard", async () => {
    const { sendIncomingOwnershipRequestEmail } = await import("@/lib/resend");
    await sendIncomingOwnershipRequestEmail({
      ownerEmail: "seller@example.com",
      requesterEmail: "buyer@example.com",
      bikeSummary,
    });
    const call = mocks.send.mock.calls[0][0];
    expect(call.to).toBe("seller@example.com");
    expect(call.subject).toBe("buyer@example.com is requesting your 2021 Honda CB500F's RoadVerdict history");
    expect(call.html).toContain("https://roadverdict.co.uk/dashboard");
  });
});

describe("sendOwnershipRequestApprovedEmail", () => {
  it("notifies the requester of approval", async () => {
    const { sendOwnershipRequestApprovedEmail } = await import("@/lib/resend");
    await sendOwnershipRequestApprovedEmail({ requesterEmail: "buyer@example.com", bikeSummary });
    const call = mocks.send.mock.calls[0][0];
    expect(call.to).toBe("buyer@example.com");
    expect(call.subject).toBe("Your request for the 2021 Honda CB500F's history was approved");
  });
});

describe("sendOwnershipRequestDeclinedEmail", () => {
  it("notifies the requester of decline", async () => {
    const { sendOwnershipRequestDeclinedEmail } = await import("@/lib/resend");
    await sendOwnershipRequestDeclinedEmail({ requesterEmail: "buyer@example.com", bikeSummary });
    const call = mocks.send.mock.calls[0][0];
    expect(call.to).toBe("buyer@example.com");
    expect(call.subject).toBe("Your request for the 2021 Honda CB500F's history wasn't approved");
  });
});
