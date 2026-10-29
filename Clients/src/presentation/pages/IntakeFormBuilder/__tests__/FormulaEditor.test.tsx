import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FormulaEditor } from "../FormulaEditor";
import type { FormField } from "../types";

const COST: FormField = { id: "cost", type: "number", label: "Monthly cost", order: 0 };
const USERS: FormField = {
  id: "field_1695123456789_a1b2c3d",
  type: "number",
  label: "Monthly users",
  order: 1,
};

function Harness({
  initial = "",
  fields = [COST, USERS],
  onChange = () => {},
}: {
  initial?: string;
  fields?: FormField[];
  onChange?: (f: string) => void;
}) {
  const [formula, setFormula] = useState(initial);
  return (
    <FormulaEditor
      formula={formula}
      numericFields={fields}
      decimals={2}
      onChange={(next) => {
        setFormula(next);
        onChange(next);
      }}
    />
  );
}

const editor = () => screen.getByRole("textbox", { name: "Formula" });
const chips = () => Array.from(editor().querySelectorAll(".formula-chip"));

/** Puts the caret at a DOM point inside the editor. */
function setCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Types text at the end of the editor, as a browser would, then fires input. */
function typeAtEnd(text: string) {
  const el = editor();
  el.focus();
  const last = el.lastChild;
  let node: Text;
  if (last && last.nodeType === Node.TEXT_NODE) {
    node = last as Text;
    node.appendData(text);
  } else {
    node = document.createTextNode(text);
    el.appendChild(node);
  }
  setCaret(node, node.length);
  fireEvent.input(el);
}

describe("FormulaEditor", () => {
  it("shows each reference as a chip with the field name, never the raw id", () => {
    renderWithProviders(<Harness initial="{field_1695123456789_a1b2c3d} * 0.05" />);
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toHaveTextContent("Field: Monthly users");
    expect(editor().textContent).not.toContain("field_");
    expect(editor().textContent).toContain("* 0.05");
  });

  it("shows a missing field chip for a reference to a deleted field", () => {
    renderWithProviders(<Harness initial="{gone} + 1" />);
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toHaveTextContent("Missing field");
    expect(chips()[0]).toHaveAttribute("data-missing", "true");
    expect(editor().textContent).not.toContain("gone");
    expect(screen.getByText("= missing field + 1")).toBeInTheDocument();
  });

  it("updates the chip when a referenced field is renamed", () => {
    const { rerender } = renderWithProviders(
      <FormulaEditor formula="{cost} * 12" numericFields={[COST]} onChange={() => {}} />,
    );
    expect(chips()[0]).toHaveTextContent("Monthly cost");
    rerender(
      <FormulaEditor
        formula="{cost} * 12"
        numericFields={[{ ...COST, label: "Yearly cost" }]}
        onChange={() => {}}
      />,
    );
    expect(chips()[0]).toHaveTextContent("Yearly cost");
    expect(screen.getByText("= Yearly cost × 12")).toBeInTheDocument();
  });

  it("names a referenced field from allFields when the picker does not list it", () => {
    renderWithProviders(
      <FormulaEditor
        formula="{users} + 1"
        numericFields={[COST]}
        allFields={[COST, { ...USERS, id: "users" }]}
        onChange={() => {}}
      />,
    );
    expect(chips()[0]).toHaveTextContent("Monthly users");
    expect(chips()[0]).not.toHaveAttribute("data-missing");
  });

  it("opens a field picker on '{' and inserts the reference as a chip", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    typeAtEnd("{");
    expect(onChange).toHaveBeenLastCalledWith("{");
    fireEvent.click(screen.getByRole("menuitem", { name: "Monthly cost" }));
    expect(onChange).toHaveBeenLastCalledWith("{cost}");
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toHaveTextContent("Monthly cost");
  });

  it("inserts the picked field at the caret, after existing text", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial="2 * " onChange={onChange} />);
    typeAtEnd("{");
    fireEvent.click(screen.getByRole("menuitem", { name: "Monthly users" }));
    expect(onChange).toHaveBeenLastCalledWith("2 * {field_1695123456789_a1b2c3d}");
  });

  it("picks a field with the arrow keys and Enter, keeping focus in the editor", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    typeAtEnd("{");
    const el = editor();
    expect(document.activeElement).toBe(el);
    fireEvent.keyDown(el, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Monthly users" })).toHaveClass("Mui-selected");
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("{field_1695123456789_a1b2c3d}");
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("keeps typing in the formula editor while the picker is open, and closes it", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    typeAtEnd("{");
    expect(screen.getByRole("menuitem", { name: "Monthly cost" })).toBeInTheDocument();
    expect(document.activeElement).toBe(editor());
    typeAtEnd("c");
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
    typeAtEnd("{");
    expect(screen.getByRole("menuitem", { name: "Monthly cost" })).toBeInTheDocument();
    fireEvent.keyDown(editor(), { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Monthly cost" })).toBeNull();
    expect(parentKeyDown).not.toHaveBeenCalled();
    // With the picker closed, Escape is left to surrounding handlers.
    fireEvent.keyDown(editor(), { key: "Escape" });
    expect(parentKeyDown).toHaveBeenCalledTimes(1);
  });

  it("deletes a whole reference with Backspace right after its chip", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial="{cost} * 12" onChange={onChange} />);
    const el = editor();
    el.focus();
    // Caret at the start of " * 12", just after the chip.
    setCaret(el.childNodes[1], 0);
    fireEvent.keyDown(el, { key: "Backspace" });
    expect(onChange).toHaveBeenLastCalledWith(" * 12");
    expect(chips()).toHaveLength(0);
  });

  it("deletes a whole reference with Delete right before its chip", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial="2 * {cost}" onChange={onChange} />);
    const el = editor();
    el.focus();
    setCaret(el.childNodes[0], 4);
    fireEvent.keyDown(el, { key: "Delete" });
    expect(onChange).toHaveBeenLastCalledWith("2 * ");
  });

  it("leaves Backspace inside plain text to the browser", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial="{cost} * 12" onChange={onChange} />);
    const el = editor();
    el.focus();
    setCaret(el.childNodes[1], 3);
    const notPrevented = fireEvent.keyDown(el, { key: "Backspace" });
    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("steps over a chip as one unit with the arrow keys", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial="1 + {cost} * 12" onChange={onChange} />);
    const el = editor();
    el.focus();
    setCaret(el.childNodes[2], 0);
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    // The caret now sits before the chip, so Delete removes the reference.
    fireEvent.keyDown(el, { key: "Delete" });
    expect(onChange).toHaveBeenLastCalledWith("1 +  * 12");
  });

  it("pastes plain text at the caret", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial="{cost}" onChange={onChange} />);
    const el = editor();
    el.focus();
    setCaret(el, 1);
    fireEvent.paste(el, { clipboardData: { getData: () => " * 12\n" } });
    expect(onChange).toHaveBeenLastCalledWith("{cost} * 12 ");
  });

  it("turns a typed reference into a chip", () => {
    renderWithProviders(<Harness />);
    typeAtEnd("{cost}");
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toHaveTextContent("Monthly cost");
  });

  it("reads the formula back with labels and previews it with inputs set to 1", () => {
    renderWithProviders(<Harness initial="{cost} * 12" />);
    expect(screen.getByText("= Monthly cost × 12")).toBeInTheDocument();
    expect(screen.getByText("Result with every input set to 1:")).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
  });

  it("names what comes before a parse error instead of a character position", () => {
    renderWithProviders(<Harness initial="{cost} * 12)" />);
    expect(screen.getByText("Unexpected ')' after “Monthly cost × 12”")).toBeInTheDocument();
    expect(editor()).toHaveAttribute("aria-invalid", "true");
  });
});
