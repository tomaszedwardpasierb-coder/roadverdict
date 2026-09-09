// Place at: tests/components/CarModSearchAutocomplete.test.tsx
//
// Car equivalent of ModSearchAutocomplete.test.tsx - same hand-rolled
// autocomplete, exercised against the real CAR_MOD_LABEL_TO_KEY catalog.
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarModSearchAutocomplete } from "@/app/dashboard/CarModSearchAutocomplete";

function Controlled({ onSelect }: { onSelect: (label: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <CarModSearchAutocomplete id="car-mod-search" value={value} onChange={setValue} onSelect={onSelect} />
  );
}

describe("CarModSearchAutocomplete", () => {
  it("shows no suggestions until something is typed", async () => {
    const user = userEvent.setup();
    render(<Controlled onSelect={vi.fn()} />);
    await user.click(screen.getByRole("textbox"));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("filters real catalog labels case-insensitively as substring matches", async () => {
    const user = userEvent.setup();
    render(<Controlled onSelect={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "TOW");

    expect(screen.getByText("Tow bar / tow hitch")).toBeInTheDocument();
    expect(screen.queryByText("Dash cam")).not.toBeInTheDocument();
  });

  it("selecting a suggestion calls onSelect with the real label and closes the list", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onSelect={onSelect} />);
    await user.type(screen.getByRole("textbox"), "dash cam");
    await user.click(screen.getByRole("button", { name: "Dash cam" }));

    expect(onSelect).toHaveBeenCalledWith("Dash cam");
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
    await user.type(screen.getByRole("textbox"), "roof");
    expect(screen.getByRole("list")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
