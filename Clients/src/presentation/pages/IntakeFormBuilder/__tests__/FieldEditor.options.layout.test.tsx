import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldEditor } from "../FieldEditor";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import type { FormField } from "../types";

// The settings panel is 325px wide while the shared Field CSS sets
// min-width: 220px, so each option input opts out with minWidth: 0.
// jsdom loads no CSS and does no layout: these tests check that the
// override is applied to the Field roots, not that the row fits on screen.
const SELECT_FIELD: FormField = {
  id: "sector",
  type: "select",
  label: "Sector",
  order: 0,
  options: [
    { label: "Option 1", value: "option1" },
    { label: "Option 2", value: "option2" },
  ],
};

const MULTISELECT_FIELD: FormField = {
  ...SELECT_FIELD,
  id: "regions",
  type: "multiselect",
  label: "Regions",
};

const renderEditor = (field: FormField) =>
  renderWithProviders(
    <FieldEditor
      field={field}
      allFields={[field]}
      entityType={IntakeEntityType.USE_CASE}
      onChange={vi.fn()}
      onClose={vi.fn()}
    />,
  );

function expectShrinkableOptionRow(index: number) {
  for (const inputId of [`option-label-${index}`, `option-value-${index}`]) {
    const input = document.getElementById(inputId);
    expect(input, `${inputId} should render`).not.toBeNull();
    const fieldRoot = input!.closest(".field");
    expect(fieldRoot, `${inputId} should sit inside a Field root`).not.toBeNull();
    expect(getComputedStyle(fieldRoot!).minWidth).toBe("0px");
    expect(getComputedStyle(fieldRoot!).flexGrow).toBe("1");
  }
}

describe("FieldEditor options layout", () => {
  it("lets dropdown option label/value inputs shrink below the Field min-width", () => {
    renderEditor(SELECT_FIELD);
    expectShrinkableOptionRow(0);
    expectShrinkableOptionRow(1);
  });

  it("lets multi-select option label/value inputs shrink below the Field min-width", () => {
    renderEditor(MULTISELECT_FIELD);
    expectShrinkableOptionRow(0);
  });
});

describe("FieldEditor remove option", () => {
  it("removes an option from its labelled button", () => {
    renderEditor(SELECT_FIELD);
    const buttons = screen.getAllByRole("button", { name: "Remove option" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(screen.getAllByRole("button", { name: "Remove option" })).toHaveLength(1);
    expect(screen.getByDisplayValue("Option 2")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Option 1")).not.toBeInTheDocument();
  });

  it("disables the button when only one option is left", () => {
    renderEditor({ ...SELECT_FIELD, options: [{ label: "Only", value: "only" }] });
    const button = screen.getByRole("button", { name: "Remove option" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.getByDisplayValue("Only")).toBeInTheDocument();
  });
});
