// Place at: tests/components/LabourSearchAutocomplete.test.tsx
//
// A hand-rolled autocomplete over the real LABOUR_LABEL_TO_KEY catalog
// (same approach as ModSearchAutocomplete, per the component's own
// comment) - so this exercises the real filtering against real labels
// rather than a fake list.
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabourSearchAutocomplete } from "@/app/dashboard/LabourSearchAutocomplete";

function Controlled({ onSelect }: { onSelect: (label: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <LabourSearchAutocomplete id="labour-search" value={value} onChange={setValue} onSelect={onSelect} />
  );
}

describe("LabourSearchAutocomplete", () => {
  it("shows no suggestions until something is typed", async () => {
    const user = userEvent.setup();
    render(<Controlled onSelect={vi.fn()} />);
    await user.click(screen.getByRole("textbox"));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("filters real catalog labels case-insensitively as substring matches", async () => {
    const user = userEvent.setup();
    render(<Controlled onSelect={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "CLUTCH");

    expect(screen.getByText("Clutch inspection")).toBeInTheDocument();
    expect(screen.getByText("Clutch adjustment")).toBeInTheDocument();
    expect(screen.queryByText("Coolant replacement")).not.toBeInTheDocument();
  });

  it("selecting a suggestion calls onSelect with the real label and closes the list", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onSelect={onSelect} />);
    await user.type(screen.getByRole("textbox"), "coolant");
    await user.click(screen.getByRole("button", { name: "Coolant replacement" }));

    expect(onSelect).toHaveBeenCalledWith("Coolant replacement");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("closes the list on blur when nothing was selected", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Controlled onSelect={vi.fn()} />
        <button>elsewhere</button>
      </>
    );
    await user.type(screen.getByRole("textbox"), "brake");
    expect(screen.getByRole("list")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
