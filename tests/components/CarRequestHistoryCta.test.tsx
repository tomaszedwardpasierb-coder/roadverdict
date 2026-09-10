// Mirrors RequestHistoryCta.test.tsx for the car equivalent component.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarRequestHistoryCta } from "@/app/car-report/[token]/CarRequestHistoryCta";

describe("CarRequestHistoryCta", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("when signed out, shows a sign-in link (with the current path as a redirect) instead of a request button", () => {
    render(<CarRequestHistoryCta registration="AB12CDE" signedInEmail={null} currentPath="/car-report/tok123" />);

    expect(screen.queryByRole("button", { name: /Request this car's history/ })).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Sign in or create a free account/ });
    expect(link).toHaveAttribute("href", "/login?redirect=%2Fcar-report%2Ftok123");
  });

  it("when signed in, shows the real request button and posts this report's registration", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const user = userEvent.setup();
    render(<CarRequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/car-report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this car's history" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-transfer/request-ownership",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ registration: "AB12CDE" }),
      })
    );
    expect(await screen.findByText("Request sent")).toBeInTheDocument();
  });

  it("shows the server's own error message and stays on the request button when the request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "You already have a pending request for this car." }),
    });

    const user = userEvent.setup();
    render(<CarRequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/car-report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this car's history" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have a pending request for this car.");
    expect(screen.getByRole("button", { name: "Request this car's history" })).toBeInTheDocument();
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<CarRequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/car-report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this car's history" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
  });

  it("once sent, no longer shows the request button even if re-rendered with the same props", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const user = userEvent.setup();
    render(<CarRequestHistoryCta registration="AB12CDE" signedInEmail="buyer@example.com" currentPath="/car-report/tok123" />);
    await user.click(screen.getByRole("button", { name: "Request this car's history" }));

    await screen.findByText("Request sent");
    expect(screen.queryByRole("button", { name: "Request this car's history" })).not.toBeInTheDocument();
  });
});
