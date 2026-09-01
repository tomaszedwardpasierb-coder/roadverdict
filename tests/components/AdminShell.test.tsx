// Place at: tests/components/AdminShell.test.tsx
//
// The admin dashboard's shell/nav: seven sections switched by local
// state, with only the active section's content actually shown. No
// external boundaries here (no fetch, no next/navigation hooks used
// directly by this component) - everything is real React state.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminShell } from "@/app/tomasz/AdminShell";
import styles from "@/app/tomasz/adminShell.module.css";

function renderShell() {
  return render(
    <AdminShell
      overviewContent={<div>Overview panel content</div>}
      trafficContent={<div>Traffic panel content</div>}
      jobsContent={<div>Jobs panel content</div>}
      accountsContent={<div>Accounts panel content</div>}
      notificationsContent={<div>Notifications panel content</div>}
      assistantContent={<div>Assistant panel content</div>}
      databaseContent={<div>Database panel content</div>}
      logoutButton={<button type="button">Sign out</button>}
    />
  );
}

describe("AdminShell", () => {
  it("shows Overview by default, with every other section's content absent from the DOM", () => {
    renderShell();
    expect(screen.getByText("Overview panel content")).toBeInTheDocument();
    expect(screen.queryByText("Traffic panel content")).not.toBeInTheDocument();
    expect(screen.queryByText("Jobs panel content")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts panel content")).not.toBeInTheDocument();
    expect(screen.queryByText("Notifications panel content")).not.toBeInTheDocument();
    expect(screen.queryByText("Assistant panel content")).not.toBeInTheDocument();
    expect(screen.queryByText("Database panel content")).not.toBeInTheDocument();
  });

  it("the breadcrumb reflects the active section's label", () => {
    renderShell();
    expect(screen.getByText("Overview", { selector: `.${styles.breadcrumbCurrent}` })).toBeInTheDocument();
  });

  it("clicking a nav item swaps the visible content and updates the breadcrumb", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: /AI assistant/ }));

    expect(screen.getByText("Assistant panel content")).toBeInTheDocument();
    expect(screen.queryByText("Overview panel content")).not.toBeInTheDocument();
    expect(screen.getByText("AI assistant", { selector: `.${styles.breadcrumbCurrent}` })).toBeInTheDocument();
  });

  it("each of the seven nav items switches to its own distinct content", async () => {
    const user = userEvent.setup();
    renderShell();

    const cases: [name: string, expected: string][] = [
      ["Traffic & performance", "Traffic panel content"],
      ["Jobs & migrations", "Jobs panel content"],
      ["Accounts & sessions", "Accounts panel content"],
      ["Notifications", "Notifications panel content"],
      ["Database", "Database panel content"],
      ["Overview", "Overview panel content"],
    ];

    for (const [name, expected] of cases) {
      await user.click(screen.getByRole("button", { name }));
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
  });

  it("renders the passed-in logout button in the sidebar", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
