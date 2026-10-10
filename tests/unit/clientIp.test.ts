// The visitor's address behind Azure: first X-Forwarded-For entry, with
// the port Azure can add dropped, so per-address limits count one visitor
// as one visitor.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIpFromForwardedFor } from "@/lib/clientIp";
import { getClientIp } from "@/lib/auth/signInRateLimit";

describe("clientIpFromForwardedFor", () => {
  it("drops the port from IPv4 and bracketed IPv6, and keeps the first entry only", () => {
    expect(clientIpFromForwardedFor("203.0.113.5:51234")).toBe("203.0.113.5");
    expect(clientIpFromForwardedFor("203.0.113.5:51234, 10.0.0.1:443")).toBe("203.0.113.5");
    expect(clientIpFromForwardedFor("[2001:db8::1]:443")).toBe("2001:db8::1");
  });

  it("leaves addresses without a port alone", () => {
    expect(clientIpFromForwardedFor("203.0.113.5")).toBe("203.0.113.5");
    expect(clientIpFromForwardedFor("2001:db8::1")).toBe("2001:db8::1");
  });

  it("says unknown when there's nothing to read", () => {
    expect(clientIpFromForwardedFor(null)).toBe("unknown");
    expect(clientIpFromForwardedFor("")).toBe("unknown");
  });

  it("is what the sign-in rate limit reads, so two connections from one visitor count once", () => {
    const a = new NextRequest("https://roadverdict.co.uk/api/auth/request-link", { headers: { "x-forwarded-for": "203.0.113.5:51234" } });
    const b = new NextRequest("https://roadverdict.co.uk/api/auth/request-link", { headers: { "x-forwarded-for": "203.0.113.5:60001" } });
    expect(getClientIp(a)).toBe(getClientIp(b));
  });
});
