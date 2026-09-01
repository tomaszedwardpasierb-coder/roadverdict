// Place at: tests/components/DashboardTabs.test.tsx
//
// Tab navigation - all five panels are always mounted, only their
// display style toggles, so this checks the real active-tab state and
// which content is visible vs hidden.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardTabs } from "@/app/dashboard/DashboardTabs";
// Imported the same way the component itself imports it, so the CSS
// Modules class name generated here is guaranteed to match the one
// applied by the real component - rather than guessing at a hashed name.
import styles from "@/app/dashboard/dashboard.module.css";

describe("DashboardTabs", () => {
  it("starts on the Service tab, showing its content and hiding the rest", () => {
    render(
      <DashboardTabs
        serviceContent={<div>Service panel</div>}
        fuelContent={<div>Fuel panel</div>}
        modsContent={<div>Mods panel</div>}
        billsContent={<div>Bills panel</div>}
        remindersContent={<div>Reminders panel</div>}
      />
    );
    expect(screen.getByRole("button", { name: "Service" })).toHaveClass(styles.tabActive);
    expect(screen.getByText("Service panel").parentElement).toHaveStyle({ display: "block" });
    expect(screen.getByText("Fuel panel").parentElement).toHaveStyle({ display: "none" });
  });

  it("clicking another tab switches the active class and swaps which content is visible", async () => {
    const user = userEvent.setup();
    render(
      <DashboardTabs
        serviceContent={<div>Service panel</div>}
        fuelContent={<div>Fuel panel</div>}
        modsContent={<div>Mods panel</div>}
        billsContent={<div>Bills panel</div>}
        remindersContent={<div>Reminders panel</div>}
      />
    );

    await user.click(screen.getByRole("button", { name: "Fuel" }));

    expect(screen.getByRole("button", { name: "Fuel" })).toHaveClass(styles.tabActive);
    expect(screen.getByRole("button", { name: "Service" })).not.toHaveClass(styles.tabActive);
    expect(screen.getByText("Fuel panel").parentElement).toHaveStyle({ display: "block" });
    expect(screen.getByText("Service panel").parentElement).toHaveStyle({ display: "none" });
  });

  it("renders tabs in the fixed Service/Mods/Fuel/Bills/Reminders order regardless of prop order", () => {
    render(
      <DashboardTabs
        serviceContent={<div />}
        fuelContent={<div />}
        modsContent={<div />}
        billsContent={<div />}
        remindersContent={<div />}
      />
    );
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Service", "Mods & accessories", "Fuel", "Insurance, tax & MOT", "Reminders"]);
  });
});
