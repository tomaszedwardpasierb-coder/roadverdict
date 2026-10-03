// The sample-bike demo: scan a receipt, watch the logbook and charts react,
// get offered a question, and find everything else locked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoExperience } from "@/app/demo/DemoExperience";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
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

describe("DemoExperience", () => {
  it("shows the sample bike with its figures and charts, and says the data is made up", () => {
    render(<DemoExperience />);
    expect(screen.getByRole("heading", { level: 1, name: "Yamaha MT-07" })).toBeInTheDocument();
    expect(screen.getByText("Sample bike · made-up data")).toBeInTheDocument();
    expect(screen.getByText("spent in 12 months")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Monthly spending over 12 months/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Fuel economy between fill-ups/ })).toBeInTheDocument();
  });

  it("reads the sample receipt, adds it to the logbook, then offers a question", async () => {
    respondTo("/api/demo/scan", {
      summary: "Service",
      items: [{ category: "service", date: "2026-09-24", costGbp: 199, description: "Full service", litres: null, mileageOnReceipt: 12480, merchantName: "Riverside Moto Services" }],
    });
    const user = userEvent.setup();
    render(<DemoExperience />);
    await user.click(screen.getByRole("button", { name: "Use the sample receipt" }));

    expect(await screen.findByText("Added to the logbook")).toBeInTheDocument();
    expect(screen.getAllByText(/Riverside Moto Services – Full service/).length).toBeGreaterThan(0);
    expect(screen.getByText("Scanned just now")).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: /Now ask your logbook a question/ }, { timeout: 3000 })).toBeInTheDocument();
  });

  it("shows the reason when a receipt can't be read", async () => {
    respondTo("/api/demo/scan", { error: "You've used today's free samples." }, false);
    const user = userEvent.setup();
    render(<DemoExperience />);
    await user.click(screen.getByRole("button", { name: "Use the sample receipt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've used today's free samples.");
    expect(screen.queryByText("Added to the logbook")).not.toBeInTheDocument();
  });

  it("answers a suggested question and then points to a free account", async () => {
    respondTo("/api/demo/ask", { answer: "You spent £668 on servicing." });
    const user = userEvent.setup();
    render(<DemoExperience />);
    await user.click(screen.getByRole("button", { name: "Ask a question" }));
    await user.click(screen.getByRole("button", { name: "What have I spent on servicing this year?" }));

    expect(await screen.findByText("You spent £668 on servicing.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/demo/ask");
    expect(JSON.parse(call![1].body).question).toBe("What have I spent on servicing this year?");
    expect(screen.getByRole("link", { name: /Ask about your own vehicle/ }).getAttribute("href")).toContain("src=demo");
  });

  it("locks everything else behind a free account", async () => {
    const user = userEvent.setup();
    render(<DemoExperience />);
    await user.click(screen.getByRole("button", { name: /Set a reminder/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Set a reminder is part of your free account");
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Create a free account" }).length).toBeGreaterThan(0));
    expect(screen.getAllByRole("link", { name: "Create a free account" })[0].getAttribute("href")).toBe("/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike&src=demo");
    await user.click(screen.getByRole("button", { name: "Keep looking around" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
