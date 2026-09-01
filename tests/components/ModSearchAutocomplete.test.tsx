// Place at: tests/components/ModSearchAutocomplete.test.tsx
//
// A hand-rolled autocomplete over the real MOD_LABEL_TO_KEY catalog
// (deliberately not native <datalist>, per the component's own comment)
// - so this exercises the real filtering against real labels rather
// than a fake list.
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModSearchAutocomplete } from "@/app/dashboard/ModSearchAutocomplete";

function Controlled({ onSelect }: { onSelect: (label: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <ModSearchAutocomplete id="mod-search" value={value} onChange={setValue} onSelect={onSelect} />
  );
}

describe("ModSearchAutocomplete", () => {
  it("shows no suggestions until something is typed", async () => {
    const user = userEvent.setup();
    render(<Controlled onSelect={vi.fn()} />);
    await user.click(screen.getByRole("textbox"));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("filters real catalog labels case-insensitively as substring matches", async () => {
    const user = userEvent.setup();
    render(<Controlled onSelect={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "EXHAUST");

    expect(screen.getByText("Exhaust headers / downpipes")).toBeInTheDocument();
    expect(screen.getByText("Exhaust can / muffler")).toBeInTheDocument();
    expect(screen.queryByText("Screen / windshield")).not.toBeInTheDocument();
  });

  it("selecting a suggestion calls onSelect with the real label and closes the list", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onSelect={onSelect} />);
    await user.type(screen.getByRole("textbox"), "screen");
    await user.click(screen.getByRole("button", { name: "Screen / windshield" }));

    expect(onSelect).toHaveBeenCalledWith("Screen / windshield");
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
    await user.type(screen.getByRole("textbox"), "seat");
    expect(screen.getByRole("list")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
