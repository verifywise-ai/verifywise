import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the SVG import
vi.mock("../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: (props: any) => <svg data-testid="background-grid" {...props} />,
}));

import PageNotFound from "../index";

describe("PageNotFound", () => {
  it("renders without crashing", () => {
    renderWithProviders(<PageNotFound />);
    expect(screen.getByText("404 | Page not found")).toBeInTheDocument();
  });

  it("displays a 'Back to home' link", () => {
    renderWithProviders(<PageNotFound />);
    expect(screen.getByText("Back to home")).toBeInTheDocument();
  });
});
