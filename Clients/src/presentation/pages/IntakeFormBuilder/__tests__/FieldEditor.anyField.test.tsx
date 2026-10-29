import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldEditor } from "../FieldEditor";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import type { FormField } from "../types";

// A total at the top of the form, reading a number field below it.
const TOTAL: FormField = {
  id: "total",
  type: "calculated",
  label: "Total",
  order: 0,
  formula: "{cost} * 12",
};
const COST: FormField = { id: "cost", type: "number", label: "Monthly cost", order: 1 };

const renderEditor = (field: FormField, allFields: FormField[]) =>
  renderWithProviders(
    <FieldEditor
      field={field}
      allFields={allFields}
      entityType={IntakeEntityType.USE_CASE}
      onChange={vi.fn()}
      onClose={vi.fn()}
    />,
  );

describe("FieldEditor references to any field", () => {
  it("names a number field below the calculated field in the formula summary", () => {
    renderEditor(TOTAL, [TOTAL, COST]);
    expect(screen.getByText("= Monthly cost × 12")).toBeInTheDocument();
    expect(screen.queryByText(/missing field/)).not.toBeInTheDocument();
  });

  it("does not offer the field itself in its own formula", () => {
    renderEditor({ ...TOTAL, formula: "{total} + 1" }, [TOTAL, COST]);
    expect(screen.getByText("= missing field + 1")).toBeInTheDocument();
  });
});
