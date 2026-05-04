import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import VerifyWiseMultiSelect, { VerifyWiseMultiSelectOption } from "../index";

const options: VerifyWiseMultiSelectOption[] = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

describe("VerifyWiseMultiSelect", () => {
  it("renders with placeholder text", () => {
    renderWithProviders(
      <VerifyWiseMultiSelect
        options={options}
        selectedValues={[]}
        onChange={vi.fn()}
        placeholder="Pick items"
      />,
    );

    expect(screen.getByText("Pick items")).toBeInTheDocument();
  });

  it("renders with default placeholder when none is provided", () => {
    renderWithProviders(
      <VerifyWiseMultiSelect options={options} selectedValues={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Select options")).toBeInTheDocument();
  });

  it("opens dropdown and shows options when clicked", () => {
    renderWithProviders(
      <VerifyWiseMultiSelect options={options} selectedValues={[]} onChange={vi.fn()} />,
    );

    // Click the trigger button
    fireEvent.click(screen.getByText("Select options"));

    // Options should now be visible in the menu
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
    expect(screen.getByText("Option C")).toBeInTheDocument();
  });

  it("calls onChange when an option is toggled", () => {
    const handleChange = vi.fn();

    renderWithProviders(
      <VerifyWiseMultiSelect options={options} selectedValues={[]} onChange={handleChange} />,
    );

    // Open dropdown
    fireEvent.click(screen.getByText("Select options"));

    // Click on an option
    fireEvent.click(screen.getByText("Option B"));

    expect(handleChange).toHaveBeenCalledWith(["b"]);
  });

  it("removes a value when toggling a selected option", () => {
    const handleChange = vi.fn();

    renderWithProviders(
      <VerifyWiseMultiSelect
        options={options}
        selectedValues={["a", "b"]}
        onChange={handleChange}
      />,
    );

    // Open dropdown
    fireEvent.click(screen.getByText("Select options"));

    // Click on already-selected option "a"
    fireEvent.click(screen.getByText("Option A"));

    expect(handleChange).toHaveBeenCalledWith(["b"]);
  });
});
