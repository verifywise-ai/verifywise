import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldEditor, defaultValueWithin, questionOptionsFrom } from "../FieldEditor";
import { IntakeEntityType } from "../../../../domain/intake/enums";
import type { FormField } from "../types";
import type { ICustomFieldDefinition } from "../../../../domain/interfaces/i.customField";

const definition = (overrides: Partial<ICustomFieldDefinition>): ICustomFieldDefinition => ({
  id: 1,
  organization_id: 1,
  entity_type: "model_inventory",
  field_key: "tier",
  label: "Tier",
  field_type: "select",
  options: ["High", "Low"],
  required: false,
  created_by: null,
  created_at: "",
  updated_at: "",
  ...overrides,
});

const TIER = definition({});

const SELECT_QUESTION: FormField = {
  id: "q1",
  type: "select",
  label: "Risk tier",
  order: 0,
  options: [{ label: "Option 1", value: "option1" }],
};

const TEXTAREA_QUESTION: FormField = {
  id: "q2",
  type: "textarea",
  label: "Notes",
  order: 0,
};

function renderEditor(
  field: FormField,
  props: {
    customFieldDefinitions?: ICustomFieldDefinition[];
    usedEntityMappings?: string[];
    onChange?: (field: FormField) => void;
  } = {},
) {
  return renderWithProviders(
    <FieldEditor
      field={field}
      allFields={[field]}
      entityType={IntakeEntityType.MODEL}
      usedEntityMappings={props.usedEntityMappings}
      customFieldDefinitions={props.customFieldDefinitions}
      onChange={props.onChange ?? vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

function openMappingPicker() {
  const input = document.getElementById("entity-mapping")!;
  const combobox = input.parentElement!.querySelector('[role="combobox"]') as HTMLElement;
  fireEvent.mouseDown(combobox);
  return screen.getByRole("listbox");
}

describe("FieldEditor custom field mapping", () => {
  it("lists compatible custom fields under their own heading", () => {
    renderEditor(SELECT_QUESTION, { customFieldDefinitions: [TIER] });
    const listbox = openMappingPicker();
    expect(within(listbox).getByText("Custom fields")).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Tier" })).toBeInTheDocument();
  });

  it("maps the question and copies the custom field's options", async () => {
    const onChange = vi.fn();
    renderEditor(SELECT_QUESTION, { customFieldDefinitions: [TIER], onChange });
    const listbox = openMappingPicker();
    fireEvent.click(within(listbox).getByRole("option", { name: "Tier" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormField;
    expect(saved.entityFieldMapping).toBe("custom_field:tier");
    expect(saved.options).toEqual([
      { value: "High", label: "High" },
      { value: "Low", label: "Low" },
    ]);
  });

  it("keeps the value of an option that already matches, relabelled as the custom field", async () => {
    const onChange = vi.fn();
    renderEditor(
      {
        ...SELECT_QUESTION,
        options: [
          { label: "high ", value: "opt_high" },
          { label: "Medium", value: "opt_medium" },
        ],
        defaultValue: "opt_medium",
      },
      { customFieldDefinitions: [TIER], onChange },
    );
    fireEvent.click(within(openMappingPicker()).getByRole("option", { name: "Tier" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormField;
    expect(saved.options).toEqual([
      { value: "opt_high", label: "High" },
      { value: "Low", label: "Low" },
    ]);
    // The default named an option that is gone.
    expect(saved.defaultValue).toBeUndefined();
  });

  it("copies scored options by label", async () => {
    const onChange = vi.fn();
    const scored = definition({
      field_key: "impact",
      label: "Impact",
      field_type: "scored_select",
      options: [
        { id: "a1", label: "Minor", score: 1 },
        { id: "b2", label: "Severe", score: 5 },
      ],
    });
    renderEditor(SELECT_QUESTION, { customFieldDefinitions: [scored], onChange });
    fireEvent.click(within(openMappingPicker()).getByRole("option", { name: "Impact" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = onChange.mock.calls[onChange.mock.calls.length - 1][0] as FormField;
    expect(saved.entityFieldMapping).toBe("custom_field:impact");
    expect(saved.options).toEqual([
      { value: "Minor", label: "Minor" },
      { value: "Severe", label: "Severe" },
    ]);
  });

  it("offers no custom fields to a question type that cannot map to one", () => {
    renderEditor(TEXTAREA_QUESTION, {
      customFieldDefinitions: [
        TIER,
        definition({ field_key: "notes", label: "Notes field", field_type: "text" }),
      ],
    });
    const listbox = openMappingPicker();
    expect(within(listbox).queryByText("Custom fields")).not.toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "Tier" })).not.toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: "Notes field" })).not.toBeInTheDocument();
  });

  it("hides a custom field another question already maps to", () => {
    renderEditor(SELECT_QUESTION, {
      customFieldDefinitions: [TIER],
      usedEntityMappings: ["custom_field:tier"],
    });
    const listbox = openMappingPicker();
    expect(within(listbox).queryByRole("option", { name: "Tier" })).not.toBeInTheDocument();
  });

  it("still shows the question's own custom field mapping", () => {
    renderEditor(
      { ...SELECT_QUESTION, entityFieldMapping: "custom_field:tier" },
      { customFieldDefinitions: [TIER], usedEntityMappings: [] },
    );
    const listbox = openMappingPicker();
    expect(within(listbox).getByRole("option", { name: "Tier" })).toBeInTheDocument();
  });

  it("explains a mapping whose custom field no longer exists", () => {
    renderEditor(
      { ...SELECT_QUESTION, entityFieldMapping: "custom_field:gone" },
      { customFieldDefinitions: [] },
    );
    expect(screen.getByText("This custom field no longer exists")).toBeInTheDocument();
  });

  it("explains a mapping whose custom field type does not fit the question", () => {
    renderEditor(
      { id: "q3", type: "text", label: "Owner", order: 0, entityFieldMapping: "custom_field:tier" },
      { customFieldDefinitions: [TIER] },
    );
    expect(
      screen.getByText("This custom field's type does not match this question"),
    ).toBeInTheDocument();
  });

  it("explains a mapping whose question options the custom field does not have", () => {
    renderEditor(
      { ...SELECT_QUESTION, entityFieldMapping: "custom_field:tier" },
      { customFieldDefinitions: [TIER] },
    );
    expect(
      screen.getByText("Some options of this question are not options of this custom field"),
    ).toBeInTheDocument();
  });

  it("does not flag a mapping while the custom fields are loading", () => {
    renderEditor({ ...SELECT_QUESTION, entityFieldMapping: "custom_field:gone" });
    expect(screen.queryByText("This custom field no longer exists")).not.toBeInTheDocument();
  });
});

describe("questionOptionsFrom", () => {
  it("matches existing options by value or label, trimmed and case-insensitive", () => {
    expect(
      questionOptionsFrom({ options: ["High", "Low", "None"] }, [
        { value: "HIGH", label: "Top" },
        { value: "o2", label: " low" },
        { value: "o3", label: "Gone" },
      ]),
    ).toEqual([
      { value: "HIGH", label: "High" },
      { value: "o2", label: "Low" },
      { value: "None", label: "None" },
    ]);
  });

  it("matches scored options by id or label and uses an existing option once", () => {
    expect(
      questionOptionsFrom(
        {
          options: [
            { id: "s1", label: "Minor", score: 1 },
            { id: "s2", label: "minor ", score: 2 },
          ],
        },
        [{ value: "s1", label: "x" }],
      ),
    ).toEqual([
      { value: "s1", label: "Minor" },
      { value: "minor ", label: "minor " },
    ]);
  });
});

describe("defaultValueWithin", () => {
  const options = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ];
  it("keeps a default that is still an option and drops one that is not", () => {
    expect(defaultValueWithin("a", options)).toBe("a");
    expect(defaultValueWithin("z", options)).toBeUndefined();
    expect(defaultValueWithin(["a", "z", "b"], options)).toEqual(["a", "b"]);
    expect(defaultValueWithin("", options)).toBe("");
  });
});
