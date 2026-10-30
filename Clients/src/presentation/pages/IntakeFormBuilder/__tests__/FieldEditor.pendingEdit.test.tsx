import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldEditor } from "../FieldEditor";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import { getLLMFieldGuidance } from "../../../../application/repository/intakeForm.repository";
import type { FormField } from "../types";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getLLMFieldGuidance: vi.fn(),
}));

const FIRST: FormField = { id: "first", type: "text", label: "First", order: 0 };
const SECOND: FormField = { id: "second", type: "text", label: "Second", order: 1 };

const editorFor = (
  field: FormField,
  onChange: (field: FormField) => void,
  llmKeyId: number | null = null,
) => (
  <FieldEditor
    field={field}
    allFields={[FIRST, SECOND]}
    entityType={IntakeEntityType.USE_CASE}
    llmKeyId={llmKeyId}
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

  it("keeps both an outside update to the same field and the pending edit", () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(editorFor(FIRST, onChange));
    const input = typeLabel("First renamed");
    // A reorder or a save response replaces the field object mid-edit.
    rerender(editorFor({ ...FIRST, order: 5 }, onChange));
    expect(input.value).toBe("First renamed");
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", label: "First renamed", order: 5 }),
    );
  });

  it("leaves the edit to the debounce when focus moves to another input in the editor", () => {
    const onChange = vi.fn();
    renderWithProviders(editorFor(FIRST, onChange));
    const input = typeLabel("First renamed");
    const placeholder = document.getElementById("field-placeholder") as HTMLInputElement;
    fireEvent.blur(input, { relatedTarget: placeholder });
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

// Validation edits build on the latest rules, so one change never undoes another.
describe("FieldEditor validation edits", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setLength = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });

  it("keeps every rule changed within one debounce", () => {
    const onChange = vi.fn();
    renderWithProviders(editorFor(FIRST, onChange));
    setLength("field-minlength", "3");
    setLength("field-maxlength", "10");
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", validation: { minLength: 3, maxLength: 10 } }),
    );
  });

  it("keeps a rule set by an outside update to the same field", () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(editorFor(FIRST, onChange));
    rerender(editorFor({ ...FIRST, validation: { required: true } }, onChange));
    setLength("field-minlength", "3");
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ validation: { required: true, minLength: 3 } }),
    );
  });
});

// Generated guidance lands on the field it was asked for, after the request.
describe("FieldEditor generated guidance", () => {
  const guidanceRequest = () => {
    let resolve: (text: string) => void = () => {};
    vi.mocked(getLLMFieldGuidance).mockReturnValue(
      new Promise((done) => {
        resolve = (text) => done({ data: { guidanceText: text } } as never);
      }) as never,
    );
    return (text: string) => act(async () => resolve(text));
  };

  it("applies the guidance to the field it was generated for", async () => {
    const respond = guidanceRequest();
    const onChange = vi.fn();
    renderWithProviders(editorFor(FIRST, onChange, 1));
    fireEvent.click(screen.getByText("AI"));
    await respond("Why First matters");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "first", guidanceText: "Why First matters" }),
    );
  });

  it("drops the guidance when another field was opened while it was generated", async () => {
    const respond = guidanceRequest();
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(editorFor(FIRST, onChange, 1));
    fireEvent.click(screen.getByText("AI"));
    rerender(editorFor(SECOND, onChange, 1));
    await respond("Why First matters");
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ guidanceText: "Why First matters" }),
    );
    expect((document.getElementById("field-guidance") as HTMLTextAreaElement).value).toBe("");
  });

  it("drops the guidance when the field was renamed while it was generated", async () => {
    const respond = guidanceRequest();
    const onChange = vi.fn();
    renderWithProviders(editorFor(FIRST, onChange, 1));
    fireEvent.click(screen.getByText("AI"));
    typeLabel("Data retention period");
    await respond("Why First matters");
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ guidanceText: "Why First matters" }),
    );
  });

  it("lets the newly opened field ask for guidance while an old request runs", () => {
    guidanceRequest();
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(editorFor(FIRST, onChange, 1));
    fireEvent.click(screen.getByText("AI"));
    expect(screen.getByText("Generating...")).toBeInTheDocument();
    rerender(editorFor(SECOND, onChange, 1));
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("drops the guidance when the editor closed while it was generated", async () => {
    const respond = guidanceRequest();
    const onChange = vi.fn();
    const { unmount } = renderWithProviders(editorFor(FIRST, onChange, 1));
    fireEvent.click(screen.getByText("AI"));
    unmount();
    await respond("Why First matters");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps guidance the user wrote while it was generated", async () => {
    const respond = guidanceRequest();
    const onChange = vi.fn();
    renderWithProviders(editorFor(FIRST, onChange, 1));
    fireEvent.click(screen.getByText("AI"));
    const guidance = document.getElementById("field-guidance") as HTMLTextAreaElement;
    fireEvent.change(guidance, { target: { value: "My own guidance" } });
    await respond("Why First matters");
    expect(guidance.value).toBe("My own guidance");
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ guidanceText: "Why First matters" }),
    );
  });
});
