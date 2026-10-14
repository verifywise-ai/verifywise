import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldEditor } from "../FieldEditor";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import type { FormField } from "../types";

// option2 was deleted, so counting options would hand out "option3" again.
const SECTOR: FormField = {
  id: "sector",
  type: "select",
  label: "Sector",
  order: 0,
  options: [
    { label: "Option 1", value: "option1" },
    { label: "Option 3", value: "option3" },
  ],
};

describe("FieldEditor options", () => {
  it("gives a new option a value no other option uses", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FieldEditor
        field={SECTOR}
        allFields={[SECTOR]}
        entityType={IntakeEntityType.USE_CASE}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add option/ }));
    // FieldEditor debounces changes to the builder.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const options = onChange.mock.calls[onChange.mock.calls.length - 1][0].options as Array<{
      value: string;
    }>;
    expect(options.map((option) => option.value)).toEqual(["option1", "option3", "option4"]);
  });
});
