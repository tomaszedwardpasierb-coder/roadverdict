// The sample-bike demo: a read-only replica of the Reports page where only the
// scan button is live. jsdom has no canvas, so react-chartjs-2 is stubbed to
// something that records the data it was given; everything else runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const charts = vi.hoisted(() => ({ calls: [] as { kind: string; props: { data?: { datasets?: { data?: number[] }[] } } }[] }));
vi.mock("react-chartjs-2", () => ({
  Line: (props: never) => {
    charts.calls.push({ kind: "line", props });
    return <canvas data-testid="line-chart" />;
  },
  Bar: (props: never) => {
    charts.calls.push({ kind: "bar", props });
    return <canvas data-testid="bar-chart" />;
  },
}));

import { DemoExperience } from "@/app/demo/DemoExperience";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  charts.calls.length = 0;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function respondTo(url: string, body: unknown, ok = true) {
  fetchMock.mockImplementation(async (u: string) => {
    if (u === "/demo/sample-receipt.jpg") return { ok: true, blob: async () => new Blob(["img"], { type: "image/jpeg" }) };
    if (u === url) return { ok, json: async () => body };
    throw new Error(`unexpected fetch ${u}`);
  });
}

const SERVICE_RECEIPT = {
  summary: "Service",
  items: [{ category: "labour", date: "2026-09-24", costGbp: 95, description: "Full service labour", litres: null, mileageOnReceipt: 12480, merchantName: "Riverside Moto Services" }],
};

describe("DemoExperience", () => {
  it("opens on the Reports page of a sample bike, with the sidebar and the real charts", () => {
    render(<DemoExperience />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reports");
    expect(screen.getByText("Sample bike · made-up data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByText("Servicing spend over time")).toBeInTheDocument();
    expect(screen.getByText("Labour spend over time")).toBeInTheDocument();
    expect(screen.queryByText(/Not enough data/)).not.toBeInTheDocument();
    expect(charts.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("makes the scan button the one live control, and locks the rest of the menu", async () => {
    const user = userEvent.setup();
    render(<DemoExperience />);
    expect(screen.getByRole("button", { name: /Scan a receipt with AI/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Reminders" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Reminders is part of your free account");
    expect(screen.getAllByRole("link", { name: "Create a free account" })[0].getAttribute("href")).toBe("/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike&src=demo");
    await user.click(screen.getByRole("button", { name: "Keep looking around" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reads the sample receipt, adds it to the charts and offers a question", async () => {
    respondTo("/api/demo/scan", SERVICE_RECEIPT);
    const user = userEvent.setup();
    render(<DemoExperience />);
    await user.click(screen.getByRole("button", { name: /Scan a receipt with AI/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Use the sample receipt" }));

    expect(await screen.findByText("Read from your receipt and added to the logbook")).toBeInTheDocument();
    expect(screen.getByText(/Riverside Moto Services – Full service labour/)).toBeInTheDocument();
    // The labour chart gains a bar for the receipt's £95.
    expect(charts.calls.some((c) => c.props.data?.datasets?.some((d) => JSON.stringify(d.data) === JSON.stringify([85, 60, 95])))).toBe(true);
    // The mileage on the receipt moves the bike's mileage on.
    expect(screen.getAllByText(/12,480/).length).toBeGreaterThan(0);
    expect(await screen.findByRole("dialog", { name: /Now ask your logbook a question/ }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("shows the reason when a receipt can't be read, and adds nothing", async () => {
    respondTo("/api/demo/scan", { error: "You've used today's free samples." }, false);
    const user = userEvent.setup();
    render(<DemoExperience />);
    await user.click(screen.getByRole("button", { name: /Scan a receipt with AI/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Use the sample receipt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've used today's free samples.");
    expect(screen.queryByText("Read from your receipt and added to the logbook")).not.toBeInTheDocument();
  });

  it("answers a suggested question from the sample data, then points to a free account", async () => {
    respondTo("/api/demo/scan", SERVICE_RECEIPT);
    const user = userEvent.setup();
    render(<DemoExperience />);
    await user.click(screen.getByRole("button", { name: /Scan a receipt with AI/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Use the sample receipt" }));
    await screen.findByRole("dialog", { name: /Now ask your logbook a question/ }, { timeout: 3000 });

    respondTo("/api/demo/ask", { answer: "You spent £668 on servicing." });
    await user.click(screen.getByRole("button", { name: "What have I spent on servicing this year?" }));
    expect(await screen.findByText("You spent £668 on servicing.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/demo/ask");
    const body = JSON.parse(call![1].body);
    expect(body.question).toBe("What have I spent on servicing this year?");
    expect(body.scanned).toEqual([{ category: "labour", date: "2026-09-24", cost: 95, description: "Riverside Moto Services – Full service labour" }]);
    expect(screen.getByRole("link", { name: /Ask about your own vehicle/ }).getAttribute("href")).toContain("src=demo");
  });
});
