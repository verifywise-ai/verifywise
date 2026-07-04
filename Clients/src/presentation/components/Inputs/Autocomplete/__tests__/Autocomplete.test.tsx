import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AutoCompleteField from "../index";

const options = [
  { label: "Apple", id: 1 },
  { label: "Banana", id: 2 },
];

describe("AutoCompleteField Component", () => {
  it("renders label", () => {
    renderWithProviders(
      <AutoCompleteField label="Fruit" options={options} getOptionLabel={(o) => o.label} />,
    );

    expect(screen.getByText("Fruit")).toBeInTheDocument();
  });

  it("shows required asterisk", () => {
    renderWithProviders(
      <AutoCompleteField
        label="Fruit"
        options={options}
        getOptionLabel={(o) => o.label}
        isRequired
      />,
    );

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows optional label", () => {
    renderWithProviders(
      <AutoCompleteField
        label="Fruit"
        options={options}
        getOptionLabel={(o) => o.label}
        isOptional
      />,
    );

    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("renders error message", () => {
    renderWithProviders(
      <AutoCompleteField
        label="Fruit"
        options={options}
        getOptionLabel={(o) => o.label}
        error="Required field"
      />,
    );

    expect(screen.getByText("Required field")).toBeInTheDocument();
  });
});
