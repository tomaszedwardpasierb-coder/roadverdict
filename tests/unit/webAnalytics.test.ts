import { describe, expect, it } from "vitest";

import { isAnalyticsExcluded } from "@/lib/webAnalytics";

describe("isAnalyticsExcluded", () => {
  it("keeps private-token pages and the admin panel away from the analytics provider", () => {
    for (const path of [
      "/tomasz",
      "/tomasz/login",
      "/report/abc123",
      "/report/abc123/detailed",
      "/report/receipt-request/decide",
      "/car-report/abc123",
      "/bike-transfer/tok",
      "/car-transfer/tok",
    ]) {
      expect(isAnalyticsExcluded(path), path).toBe(true);
    }
  });

  it("counts the public site and the dashboard", () => {
    for (const path of ["/", "/cars", "/motorcycles", "/quote-checker", "/guides/some-guide", "/dashboard", "/login", "/reports-and-more"]) {
      expect(isAnalyticsExcluded(path), path).toBe(false);
    }
  });
});
