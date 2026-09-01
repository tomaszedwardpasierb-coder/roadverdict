// Place at: tests/components/ReminderFields.test.tsx
//
// ReminderFields is a purely controlled sub-form (no internal state of
// its own) shared by LogBillForm and LogFuelForm - each trigger row's
// type dropdown genuinely excludes whatever the OTHER rows already use,
// per its own comment, so that's exercised directly rather than assumed.
// Wrapped in a tiny stateful harness here so real user interactions
// (typing, selecting, clicking add/remove) actually flow back in as new
// props, the same way the two real forms drive it.
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReminderFields, type ReminderTriggerRow } from "@/app/dashboard/ReminderFields";

function Wrapper({ note }: { note?: string }) {
  const [checked, setChecked] = useState(true);
  const [triggers, setTriggers] = useState<ReminderTriggerRow[]>([{ intervalType: "months", intervalValue: "12", exactDate: "" }]);
  return (
    <ReminderFields
      checked={checked}
      onCheckedChange={setChecked}
      triggers={triggers}
      onTriggersChange={setTriggers}
      idPrefix="test"
      checkboxLabel="Remind me"
      note={note}
    />
  );
}

describe("ReminderFields", () => {
  it("unchecking the box hides the trigger rows; checking it again reveals the same state", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    expect(screen.getByLabelText("Track by")).toHaveValue("months");
    await user.click(screen.getByRole("checkbox", { name: "Remind me" }));
    expect(screen.queryByLabelText("Track by")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Remind me" }));
    expect(screen.getByLabelText("Track by")).toHaveValue("months");
  });

  it("only the first row's type select carries the visible 'Track by' label", async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper />);
    await user.click(screen.getByText("+ Also remind me by..."));
    expect(container.querySelectorAll("select")).toHaveLength(2);
    expect(screen.getAllByText("Track by")).toHaveLength(1);
  });

  it("switching a row's type to 'date' swaps its numeric interval input for a required date input", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.selectOptions(screen.getByLabelText("Track by"), "date");
    const valueInput = document.getElementById("test-value-0") as HTMLInputElement;
    expect(valueInput.type).toBe("date");
    expect(valueInput).toBeRequired();
  });

  it("each row's own dropdown excludes whatever type the OTHER row(s) already use", async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper />);
    await user.click(screen.getByText("+ Also remind me by...")); // row 0 stays "months", row 1 becomes "mileage" (next free type)
    const selects = container.querySelectorAll("select");
    const optionValues = (select: Element) => Array.from(select.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).value);

    expect(optionValues(selects[0])).toEqual(["months", "date"]); // mileage taken by row 1
    expect(optionValues(selects[1])).toEqual(["mileage", "date"]); // months taken by row 0
  });

  it("hides the 'add another trigger' control once all three trigger types are already in use", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByText("+ Also remind me by..."));
    await user.click(screen.getByText("+ Also remind me by..."));
    expect(screen.queryByText("+ Also remind me by...")).not.toBeInTheDocument();
  });

  it("shows a remove button only on rows after the first, and removing a row drops it from the list", async () => {
    const user = userEvent.setup();
    const { container } = render(<Wrapper />);
    expect(screen.queryByRole("button", { name: "Remove this trigger" })).not.toBeInTheDocument();

    await user.click(screen.getByText("+ Also remind me by..."));
    expect(screen.getByRole("button", { name: "Remove this trigger" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove this trigger" }));
    expect(container.querySelectorAll("select")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Remove this trigger" })).not.toBeInTheDocument();
  });

  it('shows the "whichever comes first" note only once a second trigger actually exists', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    expect(screen.queryByText(/whichever comes first/)).not.toBeInTheDocument();
    await user.click(screen.getByText("+ Also remind me by..."));
    expect(screen.getByText(/whichever comes first/)).toBeInTheDocument();
  });

  it("renders the optional note prop when supplied", () => {
    render(<Wrapper note="Some helpful context." />);
    expect(screen.getByText("Some helpful context.")).toBeInTheDocument();
  });
});
