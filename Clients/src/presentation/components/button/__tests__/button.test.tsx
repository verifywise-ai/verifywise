import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { Button } from "../index";
import light from "../../../themes/light";

describe("Button", () => {
  it("renders button text", () => {
    renderWithProviders(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("handles onClick", async () => {
    const handleClick = vi.fn();
    renderWithProviders(<Button onClick={handleClick}>Submit</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("supports disabled state", () => {
    renderWithProviders(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });

  it("does not fire onClick when disabled", () => {
    const handleClick = vi.fn();
    renderWithProviders(
      <Button disabled onClick={handleClick}>
        No click
      </Button>,
    );

    const button = screen.getByRole("button", { name: "No click" });
    expect(button).toBeDisabled();
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("applies custom testId via data-testid", () => {
    renderWithProviders(<Button testId="my-btn">Test</Button>);
    expect(screen.getByTestId("my-btn")).toBeInTheDocument();
  });

  it("passes className to the button", () => {
    renderWithProviders(<Button className="custom-class">Styled</Button>);
    const button = screen.getByRole("button", { name: "Styled" });
    expect(button.className).toContain("custom-class");
  });

  it("merges sx prop with default styles", () => {
    renderWithProviders(<Button sx={{ backgroundColor: "red" }}>Sx Button</Button>);
    const button = screen.getByRole("button", { name: "Sx Button" });
    expect(button).toBeInTheDocument();
  });

  it("sets aria-label to undefined when children is not a string", () => {
    renderWithProviders(
      <Button>
        <span>Complex child</span>
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).not.toHaveAttribute("aria-label");
  });

  it("uses fallback values when theme colors are empty", () => {
    const emptyPrimaryTheme = {
      ...light,
      alpha: () => "rgba(0,0,0,0.5)",
      palette: {
        ...light.palette,
        primary: {
          ...light.palette.primary,
          main: "",
          dark: "",
          contrastText: "",
        },
      },
    };

    renderWithProviders(
      <ThemeProvider theme={emptyPrimaryTheme}>
        <Button>Fallback</Button>
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Fallback" })).toBeInTheDocument();
  });

  it("forwards ref to the underlying MUI button", () => {
    const ref = React.createRef<HTMLButtonElement>();
    renderWithProviders(<Button ref={ref}>Ref button</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe("Ref button");
  });

  it("sets displayName for debugging", () => {
    expect(Button.displayName).toBe("Button");
  });
});
