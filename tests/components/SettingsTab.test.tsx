// Place at: tests/components/SettingsTab.test.tsx
//
// Covers SettingsTab's own four sections (profile, security, feedback,
// delete account) end-to-end against a single flexible fetch mock keyed
// by URL/method - including the real DeleteAccountModal it renders, not
// a stand-in for it. TwoFactorSettings itself already has its own full
// test file; here it's only checked for presence, not re-tested.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouterRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRouterRefresh }) }));

import { SettingsTab } from "@/app/dashboard/SettingsTab";

function fetchMock(responses: Record<string, { ok: boolean; body: unknown }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url.split("?")[0]}`;
    const response = responses[key] ?? { ok: true, body: { ok: true } };
    return { ok: response.ok, json: async () => response.body } as Response;
  });
}

const baseProps = {
  email: "rider@example.com",
  displayName: "",
  hasAvatar: false,
  initiallyEnabled: false,
  pendingDeletion: null,
};

describe("SettingsTab", () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all four sections, including the real TwoFactorSettings component", () => {
    render(<SettingsTab {...baseProps} />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByText(/Off/)).toBeInTheDocument(); // TwoFactorSettings' own "2FA off" state
    expect(screen.getByRole("heading", { name: "Feature request / report a bug" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delete account" })).toBeInTheDocument();
  });

  it("shows initials from the email when no display name or avatar is set", () => {
    render(<SettingsTab {...baseProps} />);
    expect(screen.getByText("RI")).toBeInTheDocument();
  });

  it("shows initials from the display name once one is set, in preference to the email", () => {
    render(<SettingsTab {...baseProps} displayName="Alex" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("renders an <img> for the real avatar image when hasAvatar is true, instead of initials", () => {
    render(<SettingsTab {...baseProps} hasAvatar />);
    expect(screen.getByAltText("Your avatar")).toBeInTheDocument();
    expect(screen.queryByText("RI")).not.toBeInTheDocument();
  });

  it("saves a new display name via PATCH and shows a confirmation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fetchMock({ "PATCH /api/account/profile": { ok: true, body: { displayName: "Alex" } } }));
    render(<SettingsTab {...baseProps} />);

    await user.type(screen.getByLabelText("Your name"), "Alex");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("shows the server's own error message when saving the name fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fetchMock({ "PATCH /api/account/profile": { ok: false, body: { error: "Name must be 60 characters or fewer." } } }));
    render(<SettingsTab {...baseProps} />);

    await user.type(screen.getByLabelText("Your name"), "Alex");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name must be 60 characters or fewer.");
  });

  it("uploads a chosen avatar file via POST and switches from initials to the real image", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fetchMock({ "POST /api/account/avatar": { ok: true, body: { ok: true } } }));
    render(<SettingsTab {...baseProps} />);

    const file = new File([new Uint8Array([1, 2, 3])], "me.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Upload avatar photo"), file);

    await waitFor(() => expect(screen.getByAltText("Your avatar")).toBeInTheDocument());
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("removes the avatar via DELETE and reverts to initials", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fetchMock({ "DELETE /api/account/avatar": { ok: true, body: { ok: true } } }));
    render(<SettingsTab {...baseProps} hasAvatar />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByAltText("Your avatar")).not.toBeInTheDocument());
  });

  it("sends feedback via POST and shows a confirmation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fetchMock({ "POST /api/account/feedback": { ok: true, body: { ok: true } } }));
    render(<SettingsTab {...baseProps} />);

    await user.selectOptions(screen.getByLabelText("Type"), "bug");
    await user.type(screen.getByLabelText("Message"), "The mileage field is blank");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Thanks, we've got it\./)).toBeInTheDocument();
  });

  it("opens the delete-account modal, and the confirm button stays disabled until \"DELETE\" is typed exactly", async () => {
    const user = userEvent.setup();
    render(<SettingsTab {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    // Two buttons of the same name now exist - the section's own button
    // (still in the DOM behind the modal) and the modal's confirm button,
    // which is the last one rendered.
    const modalConfirmButton = screen.getAllByRole("button", { name: "Delete my account" }).at(-1)!;
    expect(modalConfirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
    expect(modalConfirmButton).toBeDisabled();

    await user.clear(screen.getByLabelText("Type DELETE to confirm"));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(modalConfirmButton).toBeEnabled();
  });

  it("schedules deletion via the modal and closes it on success", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fetchMock({ "POST /api/account/request-deletion": { ok: true, body: { deleteAfter: "2026-10-08" } } }));
    render(<SettingsTab {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getAllByRole("button", { name: "Delete my account" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("shows the pending-deletion notice with a cancel button instead of the delete button, when a deletion is already scheduled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", fetchMock({ "POST /api/account/cancel-deletion": { ok: true, body: { ok: true } } }));
    render(<SettingsTab {...baseProps} pendingDeletion={{ deleteAfterLabel: "8 October 2026" }} />);

    expect(screen.getByText(/Deletion pending/)).toBeInTheDocument();
    expect(screen.getByText(/8 October 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete my account" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });
});
