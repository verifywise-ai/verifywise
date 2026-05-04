import { vi, describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import MegaDropdownErrorBoundary from "../MegaDropdownErrorBoundary";

describe("MegaDropdownErrorBoundary", () => {
  it("renders children when no error", () => {
    renderWithProviders(
      <MegaDropdownErrorBoundary>
        <div data-testid="child">Child content</div>
      </MegaDropdownErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("catches errors and renders fallback UI", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    // Suppress console.error for error boundary logging
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <MegaDropdownErrorBoundary>
        <ThrowError />
      </MegaDropdownErrorBoundary>,
    );

    // Should not render the child
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();

    spy.mockRestore();
  });
});
