import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import MetricInfoIcon from "../index";

describe("MetricInfoIcon", () => {
  it("renders an icon button", () => {
    const onClick = vi.fn();
    renderWithProviders(<MetricInfoIcon onClick={onClick} />);
    const button = screen.getByRole("button", {
      name: "Open help information",
    });
    expect(button).toBeInTheDocument();
  });

  it("calls onClick when the button is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(<MetricInfoIcon onClick={onClick} />);
    const button = screen.getByRole("button", {
      name: "Open help information",
    });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders with small size by default", () => {
    const onClick = vi.fn();
    renderWithProviders(<MetricInfoIcon onClick={onClick} />);
    const button = screen.getByRole("button", {
      name: "Open help information",
    });
    expect(button).toHaveClass("MuiIconButton-sizeSmall");
  });

  it("renders with medium size when specified", () => {
    const onClick = vi.fn();
    renderWithProviders(<MetricInfoIcon onClick={onClick} size="medium" />);
    const button = screen.getByRole("button", {
      name: "Open help information",
    });
    expect(button).toHaveClass("MuiIconButton-sizeMedium");
  });
});
