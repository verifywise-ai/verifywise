import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldEditor } from "../FieldEditor";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import type { FormField } from "../types";

const FIRST: FormField = { id: "first", type: "text", label: "First", order: 0 };
const SECOND: FormField = { id: "second", type: "text", label: "Second", order: 1 };

const editorFor = (field: FormField, onChange: (field: FormField) => void) => (
  <FieldEditor
    field={field}
    allFields={[FIRST, SECOND]}
    entityType={IntakeEntityType.USE_CASE}
    onChange={onChange}
    onClose={vi.fn()}
  />
);

const typeLabel = (value: string) => {
  const input = document.getElementById("field-label") as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  return input;
};

// Edits reach the builder after a 300 ms debounce. An edit still waiting
// when the editor moves on must be sent, not dropped.
describe("FieldEditor pending edit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the edit after the debounce", () => {
    const onChange = vi.fn();
    renderWithProviders(editorFor(FIRST, onChange));
    typeLabel("First renamed");
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", label: "First renamed" }),
    );
  });

  it("sends the edit when another field is selected", () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(editorFor(FIRST, onChange));
    typeLabel("First renamed");
    rerender(editorFor(SECOND, onChange));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", label: "First renamed" }),
    );
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("sends the edit when the editor closes", () => {
    const onChange = vi.fn();
    const { unmount } = renderWithProviders(editorFor(FIRST, onChange));
    typeLabel("First renamed");
    unmount();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", label: "First renamed" }),
    );
  });

  it("sends the edit when focus leaves the input, so a save click includes it", () => {
    const onChange = vi.fn();
    renderWithProviders(editorFor(FIRST, onChange));
    const input = typeLabel("First renamed");
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", label: "First renamed" }),
    );
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("lets an outside update to the same field win over the pending edit", () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(editorFor(FIRST, onChange));
    typeLabel("First renamed");
    rerender(editorFor({ ...FIRST, order: 5 }, onChange));
    vi.advanceTimersByTime(300);
    expect(onChange).not.toHaveBeenCalled();
  });
});
