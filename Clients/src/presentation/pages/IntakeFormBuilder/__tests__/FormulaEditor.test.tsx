import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FormulaEditor } from "../FormulaEditor";
import type { FormField } from "../types";

const COST: FormField = { id: "cost", type: "number", label: "Monthly cost", order: 0 };

function Harness({
  initial = "",
  onChange = () => {},
}: {
  initial?: string;
  onChange?: (f: string) => void;
}) {
  const [formula, setFormula] = useState(initial);
  return (
    <FormulaEditor
      formula={formula}
      numericFields={[COST]}
      decimals={2}
      onChange={(next) => {
        setFormula(next);
        onChange(next);
      }}
    />
  );
}

describe("FormulaEditor", () => {
  it("opens a field picker on '{' and inserts the reference", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Formula"), { target: { value: "{" } });
    fireEvent.click(screen.getByRole("menuitem", { name: "Monthly cost" }));
    expect(onChange).toHaveBeenLastCalledWith("{cost}");
  });

  it("keeps typing in the formula input while the picker is open, and closes it", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    const input = screen.getByLabelText("Formula");
    input.focus();
    fireEvent.change(input, { target: { value: "{" } });
    expect(screen.getByRole("menuitem", { name: "Monthly cost" })).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "{c" } });
    expect(onChange).toHaveBeenLastCalledWith("{c");
    expect(screen.queryByRole("menuitem", { name: "Monthly cost" })).toBeNull();
  });

  it("closes the picker on Escape without passing the key to surrounding handlers", () => {
    const parentKeyDown = vi.fn();
    renderWithProviders(
      <div onKeyDown={parentKeyDown}>
        <Harness />
      </div>,
    );
    const input = screen.getByLabelText("Formula");
    input.focus();
    fireEvent.change(input, { target: { value: "{" } });
    expect(screen.getByRole("menuitem", { name: "Monthly cost" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Monthly cost" })).toBeNull();
    expect(parentKeyDown).not.toHaveBeenCalled();
    // With the picker closed, Escape is left to surrounding handlers.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(parentKeyDown).toHaveBeenCalledTimes(1);
  });

  it("reads the formula back with labels and previews it with inputs set to 1", () => {
    renderWithProviders(<Harness initial="{cost} * 12" />);
    expect(screen.getByText("= Monthly cost × 12")).toBeInTheDocument();
    expect(screen.getByText("Result with every input set to 1:")).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
  });

  it("shows where a formula stops parsing", () => {
    renderWithProviders(<Harness initial="{cost} * 12)" />);
    expect(screen.getByText("Unexpected ')' at position 12")).toBeInTheDocument();
  });
});
