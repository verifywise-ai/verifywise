import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Chip from "../../Chip";

describe("Chip", () => {
  it("renders the label text", () => {
    renderWithProviders(<Chip label="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies uppercase text-transform by default", () => {
    renderWithProviders(<Chip label="Active" />);
    const chip = screen.getByText("Active");
    expect(chip.closest("span")).toHaveStyle({ textTransform: "uppercase" });
  });

  it("does not apply uppercase when uppercase is false", () => {
    renderWithProviders(<Chip label="Active" uppercase={false} />);
    const chip = screen.getByText("Active");
    expect(chip.closest("span")).toHaveStyle({ textTransform: "none" });
  });

  it("renders with a variant", () => {
    renderWithProviders(<Chip label="High" variant="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders with different variants", () => {
    const { unmount } = renderWithProviders(<Chip label="Low" variant="low" />);
    expect(screen.getByText("Low")).toBeInTheDocument();
    unmount();

    renderWithProviders(<Chip label="Critical" variant="critical" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("renders an icon when provided", () => {
    const icon = <span data-testid="chip-icon">!</span>;
    renderWithProviders(<Chip label="Warning" icon={icon} />);
    expect(screen.getByTestId("chip-icon")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("derives variant from label when no explicit variant is given", () => {
    renderWithProviders(<Chip label="Approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});
