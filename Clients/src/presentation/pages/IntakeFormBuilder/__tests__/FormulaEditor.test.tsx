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
const TEAM: FormField = { id: "team", type: "text", label: "Team name", order: 2 };
const ZWSP = "\u200B";

function Harness({
  initial = "",
  fields = [COST, USERS],
  allFields,
  onChange = () => {},
}: {
  initial?: string;
  fields?: FormField[];
  allFields?: FormField[];
  onChange?: (f: string) => void;
}) {
  const [formula, setFormula] = useState(initial);
  return (
    <FormulaEditor
      formula={formula}
      numericFields={fields}
      allFields={allFields}
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
/** Editor text as a reader sees it, without the caret spacers. */
const visibleText = () => (editor().textContent ?? "").split(ZWSP).join("");

/** Puts the caret at a DOM point inside the editor. */
function setCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectAll(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function fireBeforeInput(el: HTMLElement, inputType: string) {
  const event = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

/** Types text at the end of the editor, as a browser would, then fires input. */
function typeAtEnd(text: string) {
  const el = editor();
  el.focus();
  const last = el.lastChild;
  let node: Text;
  if (last && last.nodeType === Node.TEXT_NODE) {
    node = last as Text;
  } else {
    node = document.createTextNode("");
    el.appendChild(node);
  }
  setCaret(node, node.length);
  fireBeforeInput(el, "insertText");
  node.appendData(text);
  setCaret(node, node.length);
  fireEvent.input(el);
}

describe("FormulaEditor", () => {
  describe("chips", () => {
    it("shows each reference as a chip with the field name, never the raw id", () => {
      renderWithProviders(<Harness initial="{field_1695123456789_a1b2c3d} * 0.05" />);
      expect(chips()).toHaveLength(1);
      expect(chips()[0]).toHaveTextContent("Field: Monthly users");
      expect(chips()[0]).toHaveAttribute("data-state", "usable");
      expect(visibleText()).not.toContain("field_");
      expect(visibleText()).toContain("* 0.05");
    });

    it("shows a missing field chip for a reference to a deleted field", () => {
      renderWithProviders(<Harness initial="{gone} + 1" />);
      expect(chips()[0]).toHaveTextContent("Missing field");
      expect(chips()[0]).toHaveAttribute("data-state", "missing");
      expect(visibleText()).not.toContain("gone");
      expect(screen.getByText("= missing field + 1")).toBeInTheDocument();
    });

    it("marks a field on the form that this formula may not use, and gives no result", () => {
      renderWithProviders(
        <Harness initial="{team} + {cost}" fields={[COST]} allFields={[COST, TEAM]} />,
      );
      const [team, cost] = chips();
      expect(team).toHaveAttribute("data-state", "unusable");
      expect(team).toHaveTextContent("Field: Team name (Not usable in this formula)");
      expect(team).toHaveAttribute("title", "Not usable in this formula");
      expect(cost).toHaveAttribute("data-state", "usable");
      expect(screen.getByText("= Team name + Monthly cost")).toBeInTheDocument();
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("names a field with an empty label as an unnamed field", () => {
      renderWithProviders(<Harness initial="{cost} + 1" fields={[{ ...COST, label: "  " }]} />);
      expect(chips()[0]).toHaveTextContent("Field: Unnamed field");
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

    it("turns a typed reference into a chip", () => {
      renderWithProviders(<Harness />);
      typeAtEnd("{cost}");
      expect(chips()).toHaveLength(1);
      expect(chips()[0]).toHaveTextContent("Monthly cost");
    });
  });

  describe("caret positions around chips", () => {
    it("leaves a caret position after a chip picked into an empty formula", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness onChange={onChange} />);
      typeAtEnd("{");
      fireEvent.click(screen.getByRole("menuitem", { name: "Monthly cost" }));
      const el = editor();
      const selection = window.getSelection()!;
      expect(selection.anchorNode).toBe(el.lastChild);
      expect(selection.anchorNode?.nodeType).toBe(Node.TEXT_NODE);
      typeAtEnd(" + 1");
      expect(onChange).toHaveBeenLastCalledWith("{cost} + 1");
    });

    it("has a caret position between two adjacent chips", () => {
      const onChange = vi.fn();
      renderWithProviders(
        <Harness initial="{cost}{field_1695123456789_a1b2c3d}" onChange={onChange} />,
      );
      const el = editor();
      const [first] = chips();
      const between = first.nextSibling!;
      expect(between.nodeType).toBe(Node.TEXT_NODE);
      expect(between.nextSibling).toBe(chips()[1]);
      el.focus();
      setCaret(between, 1);
      fireEvent.keyDown(el, { key: "Backspace" });
      expect(onChange).toHaveBeenLastCalledWith("{field_1695123456789_a1b2c3d}");
    });
  });

  describe("picker", () => {
    it("opens on '{' and inserts the reference as a chip", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness onChange={onChange} />);
      typeAtEnd("{");
      expect(onChange).toHaveBeenLastCalledWith("{");
      fireEvent.click(screen.getByRole("menuitem", { name: "Monthly cost" }));
      expect(onChange).toHaveBeenLastCalledWith("{cost}");
      expect(chips()[0]).toHaveTextContent("Monthly cost");
    });

    it("replaces the '{' it was opened for, after existing text", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="2 * " onChange={onChange} />);
      typeAtEnd("{");
      fireEvent.click(screen.getByRole("menuitem", { name: "Monthly users" }));
      expect(onChange).toHaveBeenLastCalledWith("2 * {field_1695123456789_a1b2c3d}");
    });

    it("picks with the arrow keys and Enter, keeping focus in the editor", () => {
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

    it("closes when the caret moves away from the '{' with an arrow key", () => {
      renderWithProviders(<Harness initial="2 * " />);
      typeAtEnd("{");
      fireEvent.keyDown(editor(), { key: "ArrowLeft" });
      expect(screen.queryByRole("menuitem")).toBeNull();
    });

    it("closes when the caret is moved elsewhere by Home or a click", () => {
      renderWithProviders(<Harness initial="2 * " />);
      typeAtEnd("{");
      const el = editor();
      setCaret(el.firstChild!, 0);
      fireEvent.keyUp(el, { key: "Home" });
      expect(screen.queryByRole("menuitem")).toBeNull();

      typeAtEnd("{");
      expect(screen.getByRole("menuitem", { name: "Monthly cost" })).toBeInTheDocument();
      setCaret(el.firstChild!, 1);
      fireEvent.mouseUp(el);
      expect(screen.queryByRole("menuitem")).toBeNull();
    });

    it("stays open while the caret is right after the '{'", () => {
      renderWithProviders(<Harness />);
      typeAtEnd("{");
      fireEvent.keyUp(editor(), { key: "Shift" });
      fireEvent.mouseUp(editor());
      expect(screen.getByRole("menuitem", { name: "Monthly cost" })).toBeInTheDocument();
    });

    it("keeps focus in the editor on mouse down anywhere in the list", () => {
      renderWithProviders(<Harness />);
      typeAtEnd("{");
      const list = screen.getByRole("menu");
      expect(fireEvent.mouseDown(list)).toBe(false);
      expect(fireEvent.mouseDown(list.parentElement!)).toBe(false);
    });

    it("keeps typing in the editor while open, and closes on other text", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness onChange={onChange} />);
      typeAtEnd("{");
      expect(document.activeElement).toBe(editor());
      typeAtEnd("c");
      expect(onChange).toHaveBeenLastCalledWith("{c");
      expect(screen.queryByRole("menuitem")).toBeNull();
    });

    it("closes on Escape without passing the key to surrounding handlers", () => {
      const parentKeyDown = vi.fn();
      renderWithProviders(
        <div onKeyDown={parentKeyDown}>
          <Harness />
        </div>,
      );
      typeAtEnd("{");
      fireEvent.keyDown(editor(), { key: "Escape" });
      expect(screen.queryByRole("menuitem")).toBeNull();
      expect(parentKeyDown).not.toHaveBeenCalled();
      // With the picker closed, Escape is left to surrounding handlers.
      fireEvent.keyDown(editor(), { key: "Escape" });
      expect(parentKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe("editing", () => {
    it("deletes a whole reference with Backspace right after its chip", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="{cost} * 12" onChange={onChange} />);
      const el = editor();
      el.focus();
      setCaret(chips()[0].nextSibling!, 1);
      fireEvent.keyDown(el, { key: "Backspace" });
      expect(onChange).toHaveBeenLastCalledWith(" * 12");
      expect(chips()).toHaveLength(0);
    });

    it("deletes a whole reference with Delete right before its chip", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="2 * {cost}" onChange={onChange} />);
      const el = editor();
      el.focus();
      setCaret(el.firstChild!, 4);
      fireEvent.keyDown(el, { key: "Delete" });
      expect(onChange).toHaveBeenLastCalledWith("2 * ");
    });

    it("deletes one character with Backspace in plain text", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="{cost} * 12" onChange={onChange} />);
      const el = editor();
      el.focus();
      // In "ZWSP * 12", offset 5 sits between "1" and "2".
      setCaret(chips()[0].nextSibling!, 5);
      fireEvent.keyDown(el, { key: "Backspace" });
      expect(onChange).toHaveBeenLastCalledWith("{cost} * 2");
    });

    it("steps over a chip as one unit with the arrow keys", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="1 + {cost} * 12" onChange={onChange} />);
      const el = editor();
      el.focus();
      setCaret(chips()[0].nextSibling!, 1);
      fireEvent.keyDown(el, { key: "ArrowLeft" });
      // The caret now sits before the chip, so Delete removes the reference.
      fireEvent.keyDown(el, { key: "Delete" });
      expect(onChange).toHaveBeenLastCalledWith("1 +  * 12");
    });

    it("pastes plain text at the caret, keeping pasted references as fields", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="{cost}" onChange={onChange} />);
      const el = editor();
      el.focus();
      setCaret(el.lastChild!, 1);
      fireEvent.paste(el, { clipboardData: { getData: () => " * {cost}\n" } });
      expect(onChange).toHaveBeenLastCalledWith("{cost} * {cost} ");
      expect(chips()).toHaveLength(2);
    });

    it("copies the references of the selection, not the chip text", () => {
      renderWithProviders(<Harness initial="{cost} * 12" />);
      const el = editor();
      el.focus();
      selectAll(el);
      const setData = vi.fn();
      fireEvent.copy(el, { clipboardData: { setData } });
      expect(setData).toHaveBeenCalledWith("text/plain", "{cost} * 12");
    });

    it("cuts the references of the selection and removes them", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="{cost} * 12" onChange={onChange} />);
      const el = editor();
      el.focus();
      selectAll(el);
      const setData = vi.fn();
      fireEvent.cut(el, { clipboardData: { setData } });
      expect(setData).toHaveBeenCalledWith("text/plain", "{cost} * 12");
      expect(onChange).toHaveBeenLastCalledWith("");
    });
  });

  describe("undo and redo", () => {
    it("undoes consecutive typing as one step and redoes it", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness onChange={onChange} />);
      typeAtEnd("1");
      typeAtEnd("2");
      typeAtEnd("3");
      expect(onChange).toHaveBeenLastCalledWith("123");
      fireEvent.keyDown(editor(), { key: "z", ctrlKey: true });
      expect(onChange).toHaveBeenLastCalledWith("");
      fireEvent.keyDown(editor(), { key: "z", metaKey: true, shiftKey: true });
      expect(onChange).toHaveBeenLastCalledWith("123");
    });

    it("brings back a reference deleted with Backspace, and redoes with Ctrl+Y", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="{cost} * 12" onChange={onChange} />);
      const el = editor();
      el.focus();
      setCaret(chips()[0].nextSibling!, 1);
      fireEvent.keyDown(el, { key: "Backspace" });
      expect(onChange).toHaveBeenLastCalledWith(" * 12");
      fireEvent.keyDown(el, { key: "z", metaKey: true });
      expect(onChange).toHaveBeenLastCalledWith("{cost} * 12");
      expect(chips()).toHaveLength(1);
      fireEvent.keyDown(el, { key: "y", ctrlKey: true });
      expect(onChange).toHaveBeenLastCalledWith(" * 12");
    });

    it("undoes a picked field and a paste separately", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness onChange={onChange} />);
      typeAtEnd("{");
      fireEvent.click(screen.getByRole("menuitem", { name: "Monthly cost" }));
      const el = editor();
      setCaret(el.lastChild!, 1);
      fireEvent.paste(el, { clipboardData: { getData: () => " * 2" } });
      expect(onChange).toHaveBeenLastCalledWith("{cost} * 2");
      fireEvent.keyDown(el, { key: "z", ctrlKey: true });
      expect(onChange).toHaveBeenLastCalledWith("{cost}");
      fireEvent.keyDown(el, { key: "z", ctrlKey: true });
      expect(onChange).toHaveBeenLastCalledWith("{");
    });

    it("handles the browser undo and redo input events", () => {
      const onChange = vi.fn();
      renderWithProviders(<Harness initial="{cost}" onChange={onChange} />);
      const el = editor();
      el.focus();
      setCaret(el.lastChild!, 1);
      fireEvent.keyDown(el, { key: "Backspace" });
      expect(onChange).toHaveBeenLastCalledWith("");
      expect(fireBeforeInput(el, "historyUndo").defaultPrevented).toBe(true);
      expect(onChange).toHaveBeenLastCalledWith("{cost}");
      fireBeforeInput(el, "historyRedo");
      expect(onChange).toHaveBeenLastCalledWith("");
    });
  });

  describe("summary", () => {
    it("reads the formula back with labels and previews it with inputs set to 1", () => {
      renderWithProviders(<Harness initial="{cost} * 12" />);
      expect(screen.getByText("= Monthly cost × 12")).toBeInTheDocument();
      expect(screen.getByText("Result with every input set to 1:")).toBeInTheDocument();
      expect(screen.getByText("12.00")).toBeInTheDocument();
    });

    it("names what comes before a parse error instead of a character position", () => {
      renderWithProviders(<Harness initial="{cost} * 12)" />);
      expect(
        screen.getByText("Unexpected ')'. The problem is just after “Monthly cost × 12”"),
      ).toBeInTheDocument();
      expect(editor()).toHaveAttribute("aria-invalid", "true");
    });
  });
});
