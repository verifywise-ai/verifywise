import { renderWithProviders } from "../../../../test/renderWithProviders";
import Guider from "../Guider/index";

describe("Guider Component", () => {
  const defaultProps = {
    title: "Help Title",
    description: "This is a helpful description.",
    link: "https://example.com/docs",
  };

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<Guider {...defaultProps} />);

    expect(container).toBeTruthy();
  });

  it("renders the question mark icon trigger", () => {
    const { container } = renderWithProviders(<Guider {...defaultProps} />);

    // The Guider renders a question mark icon inside a Stack
    const svgIcon = container.querySelector("svg");
    expect(svgIcon).toBeInTheDocument();
  });
});
