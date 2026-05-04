import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { EmptyStateMessage } from "../index";

describe("EmptyStateMessage", () => {
  it("renders the default message", () => {
    renderWithProviders(<EmptyStateMessage />);
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
  });

  it("renders a custom message", () => {
    renderWithProviders(<EmptyStateMessage message="Nothing to review." />);
    expect(screen.getByText("Nothing to review.")).toBeInTheDocument();
  });

  it("has role='status'", () => {
    renderWithProviders(<EmptyStateMessage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders a custom icon when provided", () => {
    const customIcon = <span data-testid="custom-icon">star</span>;
    renderWithProviders(<EmptyStateMessage icon={customIcon} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
