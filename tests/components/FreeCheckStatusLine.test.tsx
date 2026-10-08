// Place at: tests/components/FreeCheckStatusLine.test.tsx
//
// The one line on the Full history check tab that tells a Pro account where
// it stands with its included check. The words matter here (a tester must
// never be told a free check is coming; a trial must say when it starts),
// so each state's wording is pinned.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreeCheckStatusLine } from "@/app/dashboard/FreeCheckStatusLine";
import { BUYING_GUIDE_REPORT_PRICE_LABEL } from "@/lib/payments/pricing";

// Built with the same call as the component so a locale's own month
// spelling ("Sept" vs "Sep") can't make the test disagree with it.
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

const price = BUYING_GUIDE_REPORT_PRICE_LABEL.pro.replace(".", "\\.");

describe("FreeCheckStatusLine", () => {
  it("says the free check is ready, once every 4 weeks, and where to use it", () => {
    render(<FreeCheckStatusLine status={{ state: "ready" }} />);
    expect(screen.getByText("Your free check is ready.")).toBeInTheDocument();
    expect(screen.getByText(/Look up a plate below, then choose the free full vehicle history check - one every 4 weeks with Pro\./)).toBeInTheDocument();
  });

  it("gives the date the next free check is due, and the price of another one before then", () => {
    const at = "2026-11-05T10:00:00.000Z";
    render(<FreeCheckStatusLine status={{ state: "later", at }} />);
    expect(screen.getByText(`Your next free check is on ${day(at)}.`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Another one before then is ${price}`))).toBeInTheDocument();
  });

  it("says a trial's free check starts when the trial ends, with the price until then", () => {
    const at = "2026-10-21T12:00:00.000Z";
    render(<FreeCheckStatusLine status={{ state: "trial", at }} />);
    expect(screen.getByText(`Your free check starts after your trial ends on ${day(at)}.`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Until then a check is ${price}`))).toBeInTheDocument();
  });

  it("tells a tester account plainly that it has no free check, and never promises one", () => {
    render(<FreeCheckStatusLine status={{ state: "tester" }} />);
    expect(screen.getByText("Tester accounts don't include the free check.")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`A check is ${price}`))).toBeInTheDocument();
    expect(screen.queryByText(/is ready/)).not.toBeInTheDocument();
    expect(screen.queryByText(/next free check/)).not.toBeInTheDocument();
  });
});
