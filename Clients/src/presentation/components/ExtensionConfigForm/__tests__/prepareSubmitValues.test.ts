import { initialFormValues, prepareSubmitValues } from "..";
import type { ExtensionConfigField } from "../../../../domain/types/extensions";

function field(overrides: Partial<ExtensionConfigField>): ExtensionConfigField {
  return {
    id: 1,
    fieldKey: "key",
    fieldType: "text",
    label: "Label",
    helpText: null,
    placeholder: null,
    isRequired: false,
    isSecret: false,
    defaultValue: null,
    displayOrder: 0,
    options: null,
    validation: null,
    ...overrides,
  };
}

const FIELDS = [
  field({ fieldKey: "url", fieldType: "url" }),
  field({ fieldKey: "timeout", fieldType: "number" }),
  field({ fieldKey: "tags", fieldType: "multiselect" }),
  field({ fieldKey: "verify", fieldType: "boolean" }),
  field({ fieldKey: "token", fieldType: "password", isSecret: true }),
];

describe("prepareSubmitValues", () => {
  it("sends non-secret values as they are, false included", () => {
    expect(
      prepareSubmitValues(FIELDS, {
        url: "https://x.example.com",
        timeout: 30,
        tags: ["a"],
        verify: false,
        token: "",
      }),
    ).toEqual({ url: "https://x.example.com", timeout: 30, tags: ["a"], verify: false });
  });

  it("sends an emptied non-secret field as null so the stored value is cleared", () => {
    expect(prepareSubmitValues(FIELDS, { url: "", timeout: "", tags: [], token: "" })).toEqual({
      url: null,
      timeout: null,
      tags: null,
    });
  });

  it("sends a typed secret, leaves out an untouched one, and sends null for a cleared one", () => {
    expect(prepareSubmitValues(FIELDS, { token: "s3cret" })).toEqual({ token: "s3cret" });
    expect(prepareSubmitValues(FIELDS, { token: "" })).toEqual({});
    expect(prepareSubmitValues(FIELDS, { token: null })).toEqual({ token: null });
  });

  it("leaves out fields the form never held", () => {
    expect(prepareSubmitValues(FIELDS, {})).toEqual({});
  });
});

describe("initialFormValues", () => {
  it("seeds stored values, field defaults, and blank secrets", () => {
    const fields = [
      field({ fieldKey: "url" }),
      field({ fieldKey: "verify", fieldType: "boolean", defaultValue: "true" }),
      field({ fieldKey: "token", isSecret: true }),
    ];
    expect(initialFormValues(fields, { url: "https://x.example.com", token: "ignored" })).toEqual({
      url: "https://x.example.com",
      verify: true,
      token: "",
    });
  });
});
