import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CustomizableButton } from "../customizable-button";

describe("CustomizableButton", () => {
  it("renders labeled button text", () => {
    renderWithProviders(<CustomizableButton>Save</CustomizableButton>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders icon-only button with ariaLabel and no fallback text", () => {
    renderWithProviders(
      <CustomizableButton iconOnly variant="text" size="small" ariaLabel="Close">
        <span data-testid="close-icon">X</span>
      </CustomizableButton>,
    );

    const button = screen.getByRole("button", { name: "Close" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("X");
    expect(button).not.toHaveTextContent("CustomizableButton");
  });

  it("supports icon-only via startIcon", () => {
    renderWithProviders(
      <CustomizableButton iconOnly variant="text" ariaLabel="Edit" startIcon={<span>Edit</span>} />,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toHaveTextContent("Edit");
  });

  it("handles onClick for icon-only buttons", async () => {
    const handleClick = vi.fn();
    renderWithProviders(
      <CustomizableButton iconOnly ariaLabel="Close" onClick={handleClick}>
        <span>X</span>
      </CustomizableButton>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
