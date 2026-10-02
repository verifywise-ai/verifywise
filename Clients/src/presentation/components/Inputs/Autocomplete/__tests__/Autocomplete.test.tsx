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

  // A hint is not an error: no red border, no alert, and an error replaces it.
  it("shows helper text as a hint, not as an error", () => {
    const { rerender } = renderWithProviders(
      <AutoCompleteField
        label="Fruit"
        options={options}
        getOptionLabel={(o) => o.label}
        helperText="Pick one you like"
      />,
    );

    expect(screen.getByText("Pick one you like")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-invalid", "true");

    rerender(
      <AutoCompleteField
        label="Fruit"
        options={options}
        getOptionLabel={(o) => o.label}
        helperText="Pick one you like"
        error="Required field"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Required field");
    expect(screen.queryByText("Pick one you like")).toBeNull();
  });

  it("colors the required asterisk with the error text token", () => {
    renderWithProviders(
      <AutoCompleteField
        label="Fruit"
        options={options}
        getOptionLabel={(o) => o.label}
        isRequired
      />,
    );

    expect(screen.getByText("*")).toHaveStyle({ color: "#D32F2F" });
  });
});
