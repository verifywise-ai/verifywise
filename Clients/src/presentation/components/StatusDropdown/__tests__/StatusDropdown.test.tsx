import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import StatusDropdown from "../index";

describe("StatusDropdown", () => {
  const defaultProps = {
    currentStatus: "In progress",
    onStatusChange: vi.fn().mockResolvedValue(undefined),
  };

  it("renders without crashing", () => {
    renderWithProviders(<StatusDropdown {...defaultProps} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("displays the current status", () => {
    renderWithProviders(<StatusDropdown {...defaultProps} />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("defaults to 'Not started' when currentStatus is empty", () => {
    renderWithProviders(<StatusDropdown currentStatus="" onStatusChange={vi.fn()} />);
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    renderWithProviders(<StatusDropdown {...defaultProps} disabled={true} />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("aria-disabled", "true");
  });

  it("is disabled when user role is not in allowedRoles", () => {
    renderWithProviders(
      <StatusDropdown {...defaultProps} allowedRoles={["Admin"]} userRole="Viewer" />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("aria-disabled", "true");
  });

  it("is enabled when user role is in allowedRoles", () => {
    renderWithProviders(
      <StatusDropdown {...defaultProps} allowedRoles={["Admin"]} userRole="Admin" />,
    );
    const select = screen.getByRole("combobox");
    expect(select).not.toHaveAttribute("aria-disabled", "true");
  });
});
