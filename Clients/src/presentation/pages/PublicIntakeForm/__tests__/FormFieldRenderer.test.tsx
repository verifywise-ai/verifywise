import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { useForm } from "react-hook-form";
import { FormFieldRenderer } from "../FormFieldRenderer";
import { FormField } from "../../IntakeFormBuilder/types";

/**
 * The public intake form is built entirely from backend-supplied field
 * definitions, so every control it renders has to take its accessible name
 * from `field.label`. These tests pin that association — previously the label
 * was a detached <Typography> and every input rendered unnamed.
 */

function Harness({ field }: { field: FormField }) {
  const { control, formState } = useForm<Record<string, unknown>>();
  return <FormFieldRenderer field={field} control={control} errors={formState.errors} />;
}

function makeField(overrides: Partial<FormField> = {}): FormField {
  return {
    id: "company_name",
    type: "text",
    label: "Company name",
    order: 1,
    ...overrides,
  };
}

describe("FormFieldRenderer accessible names", () => {
  it.each([
    ["text", "text"],
    ["email", "email"],
    ["url", "url"],
    ["textarea", "textarea"],
    ["number", "number"],
    ["date", "date"],
  ])("names a %s field from field.label", (type) => {
    renderWithProviders(<Harness field={makeField({ type: type as FormField["type"] })} />);
    expect(screen.getByLabelText(/Company name/)).toBeInTheDocument();
  });

  it("marks a required field's label without breaking the association", () => {
    renderWithProviders(<Harness field={makeField({ validation: { required: true } })} />);
    expect(screen.getByLabelText(/Company name/)).toBeInTheDocument();
  });

  it("names a select from field.label rather than its placeholder", () => {
    renderWithProviders(
      <Harness
        field={makeField({
          id: "tier",
          type: "select",
          label: "Risk tier",
          options: [
            { value: "high", label: "High" },
            { value: "low", label: "Low" },
          ],
        })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Risk tier" })).toBeInTheDocument();
  });

  it("names a checkbox field from field.label", () => {
    renderWithProviders(
      <Harness field={makeField({ id: "agree", type: "checkbox", label: "I agree" })} />,
    );
    expect(screen.getByRole("checkbox", { name: /I agree/ })).toBeInTheDocument();
  });

  describe("multiselect", () => {
    const field = makeField({
      id: "regions",
      type: "multiselect",
      label: "Regions",
      options: [
        { value: "eu", label: "Europe" },
        { value: "us", label: "United States" },
      ],
    });

    it("groups the options under the field label", () => {
      renderWithProviders(<Harness field={field} />);
      expect(screen.getByRole("group", { name: "Regions" })).toBeInTheDocument();
    });

    it("names each option checkbox from its own option label", () => {
      renderWithProviders(<Harness field={field} />);
      expect(screen.getByRole("checkbox", { name: "Europe" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "United States" })).toBeInTheDocument();
    });

    it("toggles an option from the keyboard, not only the mouse", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness field={field} />);

      const europe = screen.getByRole("checkbox", { name: "Europe" });
      expect(europe).not.toBeChecked();

      act(() => europe.focus());
      await user.keyboard(" ");

      expect(screen.getByRole("checkbox", { name: "Europe" })).toBeChecked();
    });

    it("still toggles when the row is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness field={field} />);

      await user.click(screen.getByText("United States"));

      expect(screen.getByRole("checkbox", { name: "United States" })).toBeChecked();
    });

    it("deselects an option that is already selected", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness field={field} />);

      const europe = screen.getByRole("checkbox", { name: "Europe" });
      await user.click(europe);
      expect(screen.getByRole("checkbox", { name: "Europe" })).toBeChecked();

      await user.click(screen.getByRole("checkbox", { name: "Europe" }));
      expect(screen.getByRole("checkbox", { name: "Europe" })).not.toBeChecked();
    });
  });
});
