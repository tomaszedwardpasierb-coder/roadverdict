// Place at: tests/components/TabSwitchContext.test.tsx
//
// TabSwitchContext is one of three shared dashboard contexts consumed
// by several other components in this batch (RecentActivity, every
// chart). Its two exported pure helpers - viewRecords and
// goToNextReview - carry the real branching logic (which category to
// jump to next), so they're tested directly as plain functions rather
// than only indirectly through a rendered tree. The Provider/hook pair
// is also exercised directly, including the no-provider fallback that
// other components rely on to never crash.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TabSwitchProvider,
  useTabSwitch,
  viewRecords,
  goToNextReview,
  type ReviewCategory,
} from "@/app/dashboard/TabSwitchContext";

describe("useTabSwitch (no provider)", () => {
  it("falls back to safe no-ops instead of throwing when rendered outside a provider", () => {
    function Consumer() {
      const { switchTo, focusId, setFocusId, highlightIds, setHighlightIds } = useTabSwitch();
      return (
        <div>
          <span>focusId:{String(focusId)}</span>
          <span>highlightIds:{highlightIds.join(",")}</span>
          <button onClick={() => switchTo("fuel")}>switch</button>
          <button onClick={() => setFocusId("x")}>setFocus</button>
          <button onClick={() => setHighlightIds(["a"])}>setHighlight</button>
        </div>
      );
    }
    render(<Consumer />);
    expect(screen.getByText("focusId:null")).toBeInTheDocument();
    expect(screen.getByText("highlightIds:")).toBeInTheDocument();
    // None of these should throw even though there's no provider above.
    expect(() => screen.getByRole("button", { name: "switch" }).click()).not.toThrow();
  });
});

describe("TabSwitchProvider", () => {
  function Consumer() {
    const { focusId, highlightIds, setFocusId, setHighlightIds, switchTo } = useTabSwitch();
    return (
      <div>
        <span>focusId:{String(focusId)}</span>
        <span>highlightIds:{highlightIds.join(",")}</span>
        <button onClick={() => setFocusId("rec-1")}>setFocus</button>
        <button onClick={() => setHighlightIds(["rec-1", "rec-2"])}>setHighlight</button>
        <button onClick={() => switchTo("mods")}>switchTo mods</button>
      </div>
    );
  }

  it("provides real state that updates on setFocusId/setHighlightIds, and forwards switchTo to onSwitchTab", async () => {
    const onSwitchTab = vi.fn();
    const user = userEvent.setup();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <Consumer />
      </TabSwitchProvider>
    );

    expect(screen.getByText("focusId:null")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "setFocus" }));
    expect(screen.getByText("focusId:rec-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "setHighlight" }));
    expect(screen.getByText("highlightIds:rec-1,rec-2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "switchTo mods" }));
    expect(onSwitchTab).toHaveBeenCalledWith("mods");
  });
});

describe("viewRecords", () => {
  it("does nothing when given no ids", () => {
    const switchTo = vi.fn();
    const setHighlightIds = vi.fn();
    viewRecords("fuel", [], switchTo, setHighlightIds);
    expect(switchTo).not.toHaveBeenCalled();
    expect(setHighlightIds).not.toHaveBeenCalled();
  });

  it("switches to the category and highlights every id given", () => {
    const switchTo = vi.fn();
    const setHighlightIds = vi.fn();
    viewRecords("bills", ["a", "b", "c"], switchTo, setHighlightIds);
    expect(switchTo).toHaveBeenCalledWith("bills");
    expect(setHighlightIds).toHaveBeenCalledWith(["a", "b", "c"]);
  });
});

describe("goToNextReview", () => {
  function pending(overrides: Partial<Record<ReviewCategory, string[]>> = {}): Record<ReviewCategory, string[]> {
    return { service: [], fuel: [], mods: [], bills: [], ...overrides };
  }

  it("stays on the same category, focusing the next pending id there, when something else is still pending in it", () => {
    const switchTo = vi.fn();
    const setFocusId = vi.fn();
    goToNextReview(pending({ service: ["saved-one", "next-one"] }), "service", "saved-one", switchTo, setFocusId);
    expect(switchTo).not.toHaveBeenCalled();
    expect(setFocusId).toHaveBeenCalledWith("next-one");
  });

  it("excludes myId even if the snapshot still lists it as pending", () => {
    const switchTo = vi.fn();
    const setFocusId = vi.fn();
    // Only "saved-one" pending in service, and it's the one just saved -
    // so service has nothing REMAINING even though the snapshot lists it.
    goToNextReview(pending({ service: ["saved-one"], fuel: ["fuel-1"] }), "service", "saved-one", switchTo, setFocusId);
    expect(switchTo).toHaveBeenCalledWith("fuel");
    expect(setFocusId).toHaveBeenCalledWith("fuel-1");
  });

  it("moves to the next category in CATEGORY_ORDER (service, fuel, mods, bills), skipping empty ones", () => {
    const switchTo = vi.fn();
    const setFocusId = vi.fn();
    goToNextReview(pending({ mods: ["mod-1"] }), "service", "saved-one", switchTo, setFocusId);
    expect(switchTo).toHaveBeenCalledWith("mods");
    expect(setFocusId).toHaveBeenCalledWith("mod-1");
  });

  it("never switches back to myCategory while scanning other categories, even if myCategory is earlier in the order", () => {
    const switchTo = vi.fn();
    const setFocusId = vi.fn();
    // myCategory is "mods" here, so it must be skipped even though it's
    // listed (redundantly, since it's excluded) - fuel comes next and has ids.
    goToNextReview(pending({ fuel: ["fuel-1"] }), "mods", "irrelevant", switchTo, setFocusId);
    expect(switchTo).toHaveBeenCalledWith("fuel");
    expect(switchTo).not.toHaveBeenCalledWith("mods");
  });

  it("clears focus with no tab switch when nothing is pending anywhere", () => {
    const switchTo = vi.fn();
    const setFocusId = vi.fn();
    goToNextReview(pending(), "service", "saved-one", switchTo, setFocusId);
    expect(switchTo).not.toHaveBeenCalled();
    expect(setFocusId).toHaveBeenCalledWith(null);
  });
});
