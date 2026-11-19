import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { ExtensionConfigForm } from "..";
import type { ExtensionConfigField } from "../../../../domain/types/extensions";
import { renderWithProviders } from "../../../../test/renderWithProviders";

function secret(overrides: Partial<ExtensionConfigField>): ExtensionConfigField {
  return {
    id: 1,
    fieldKey: "api_key",
    fieldType: "password",
    label: "API key",
    helpText: null,
    placeholder: null,
    isRequired: false,
    isSecret: true,
    defaultValue: null,
    displayOrder: 0,
    options: null,
    validation: null,
    ...overrides,
  };
}

describe("ExtensionConfigForm stored secrets", () => {
  it("offers Clear for an optional stored secret", () => {
    renderWithProviders(
      <ExtensionConfigForm fields={[secret({})]} initialValues={{}} secretsSet={["api_key"]} />,
    );

    expect(screen.getByTestId("ext-field-api_key-clear")).toBeInTheDocument();
  });

  it("offers no Clear for a required stored secret, which the server would reject", () => {
    renderWithProviders(
      <ExtensionConfigForm
        fields={[secret({ isRequired: true })]}
        initialValues={{}}
        secretsSet={["api_key"]}
      />,
    );

    expect(screen.queryByTestId("ext-field-api_key-clear")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Stored. Leave blank to keep it.")).not.toBeDisabled();
  });
});
