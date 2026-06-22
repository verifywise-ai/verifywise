import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { EmptyState } from "../index";

describe("EmptyState", () => {
  it("renders the default message", () => {
    renderWithProviders(<EmptyState />);
    expect(screen.getByText("There is currently no data in this table.")).toBeInTheDocument();
  });

  it("renders a custom message", () => {
    renderWithProviders(<EmptyState message="No vendors found." />);
    expect(screen.getByText("No vendors found.")).toBeInTheDocument();
  });

  it("has role='status'", () => {
    renderWithProviders(<EmptyState />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders children when provided", () => {
    renderWithProviders(
      <EmptyState>
        <span data-testid="child-content">Add a new item</span>
      </EmptyState>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Add a new item")).toBeInTheDocument();
  });

  it("uses the imageAlt prop for aria-label", () => {
    renderWithProviders(<EmptyState imageAlt="No results" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "No results");
  });

  it("renders with border by default", () => {
    renderWithProviders(<EmptyState />);
    expect(screen.getByRole("status")).toHaveStyle({ borderRadius: "4px" });
  });

  it("omits border when showBorder is false", () => {
    renderWithProviders(<EmptyState showBorder={false} />);
    const status = screen.getByRole("status");
    expect(status).not.toHaveStyle({ border: expect.stringContaining("dashed") });
  });
});
