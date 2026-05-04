import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { Check } from "../index";

describe("Check", () => {
  it("renders the text", () => {
    renderWithProviders(<Check text="Requirement met" />);
    expect(screen.getByText("Requirement met")).toBeInTheDocument();
  });

  it("renders with default info variant", () => {
    const { container } = renderWithProviders(<Check text="Info check" />);
    // Info variant renders a Circle icon (SVG present)
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders with success variant", () => {
    const { container } = renderWithProviders(<Check text="Success check" variant="success" />);
    expect(screen.getByText("Success check")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders with error variant", () => {
    renderWithProviders(<Check text="Error check" variant="error" />);
    expect(screen.getByText("Error check")).toBeInTheDocument();
  });

  it("renders with warning variant", () => {
    renderWithProviders(<Check text="Warning check" variant="warning" />);
    expect(screen.getByText("Warning check")).toBeInTheDocument();
  });

  it("renders outlined icon when isOutlined is true", () => {
    const { container } = renderWithProviders(<Check text="Outlined check" isOutlined />);
    expect(screen.getByText("Outlined check")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
