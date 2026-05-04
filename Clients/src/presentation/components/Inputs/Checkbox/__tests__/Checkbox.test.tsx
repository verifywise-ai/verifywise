import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import Checkbox from "../index";

describe("Checkbox Component", () => {
  it("renders with a label", () => {
    renderWithProviders(
      <Checkbox
        id="test-cb"
        label="Accept terms"
        isChecked={false}
        value="false"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Accept terms")).toBeInTheDocument();
  });

  it("renders without label (table mode)", () => {
    renderWithProviders(
      <Checkbox id="test-cb" isChecked={false} value="false" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox", { name: /controlled checkbox/i })).toBeInTheDocument();
  });

  it("reflects checked state", () => {
    renderWithProviders(
      <Checkbox id="test-cb" label="Check me" isChecked={true} value="true" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("reflects unchecked state", () => {
    renderWithProviders(
      <Checkbox id="test-cb" label="Check me" isChecked={false} value="false" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("calls onChange when clicked", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <Checkbox
        id="test-cb"
        label="Toggle me"
        isChecked={false}
        value="false"
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole("checkbox"));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("is disabled when isDisabled is true", () => {
    renderWithProviders(
      <Checkbox
        id="test-cb"
        label="Disabled"
        isChecked={false}
        value="false"
        onChange={vi.fn()}
        isDisabled
      />,
    );

    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
