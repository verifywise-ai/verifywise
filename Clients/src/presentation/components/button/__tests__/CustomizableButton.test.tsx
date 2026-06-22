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

  it("renders with text prop", () => {
    renderWithProviders(<CustomizableButton text="Submit" />);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("renders endIcon", () => {
    renderWithProviders(
      <CustomizableButton endIcon={<span data-testid="end-icon">→</span>}>Next</CustomizableButton>,
    );
    expect(screen.getByTestId("end-icon")).toBeInTheDocument();
  });

  it("applies testId as data-testid", () => {
    renderWithProviders(<CustomizableButton testId="save-btn">Save</CustomizableButton>);
    expect(screen.getByTestId("save-btn")).toBeInTheDocument();
  });

  it("applies type prop", () => {
    renderWithProviders(<CustomizableButton type="submit">Submit</CustomizableButton>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("applies className", () => {
    const { container } = renderWithProviders(
      <CustomizableButton className="my-class">Click</CustomizableButton>,
    );
    expect(container.querySelector(".my-class")).toBeInTheDocument();
  });

  it("renders fullWidth button", () => {
    renderWithProviders(<CustomizableButton fullWidth>Full</CustomizableButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders disabled state via isDisabled prop", () => {
    renderWithProviders(<CustomizableButton isDisabled>Disabled</CustomizableButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders disabled state via disabled alias prop", () => {
    renderWithProviders(<CustomizableButton disabled>Disabled</CustomizableButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not fire onClick when disabled", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CustomizableButton isDisabled onClick={handleClick}>
        Disabled
      </CustomizableButton>,
    );
    await user.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("prevents click when loading via aria-disabled and pointer-events none", () => {
    const handleClick = vi.fn();
    renderWithProviders(
      <CustomizableButton loading onClick={handleClick}>
        Loading
      </CustomizableButton>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-disabled", "true");
    // pointer-events: none prevents user interaction
    expect(button.className).toContain("Mui-disabled");
  });

  it("renders loading spinner when loading is true", () => {
    renderWithProviders(<CustomizableButton loading>Save</CustomizableButton>);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders isLink variant without elevation", () => {
    renderWithProviders(<CustomizableButton isLink>Link</CustomizableButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles keyboard Enter key", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CustomizableButton onClick={handleClick}>Enter Me</CustomizableButton>);
    const button = screen.getByRole("button");
    button.focus();
    await user.keyboard("{Enter}");
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("handles keyboard Space key", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CustomizableButton onClick={handleClick}>Space Me</CustomizableButton>);
    const button = screen.getByRole("button");
    button.focus();
    await user.keyboard(" ");
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
