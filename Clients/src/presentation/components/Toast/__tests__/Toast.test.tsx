import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomizableToast from "../index";

describe("CustomizableToast Component", () => {
  it("renders with default message", () => {
    renderWithProviders(<CustomizableToast />);

    expect(screen.getByText("Request is in the process. Please wait...")).toBeInTheDocument();
  });

  it("renders with a custom title", () => {
    renderWithProviders(<CustomizableToast title="Loading data..." />);

    expect(screen.getByText("Loading data...")).toBeInTheDocument();
  });

  it("does not render the default message when a custom title is provided", () => {
    renderWithProviders(<CustomizableToast title="Custom message" />);

    expect(screen.queryByText("Request is in the process. Please wait...")).not.toBeInTheDocument();
    expect(screen.getByText("Custom message")).toBeInTheDocument();
  });
});
