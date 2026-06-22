import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import EmptyIllustration from "../EmptyIllustration";
import { Inbox } from "lucide-react";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe("EmptyIllustration", () => {
  it("renders an SVG element", () => {
    const { container } = renderWithTheme(<EmptyIllustration icon={Inbox} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "180");
    expect(svg).toHaveAttribute("height", "120");
  });

  it("applies scale prop", () => {
    const { container } = renderWithTheme(<EmptyIllustration icon={Inbox} scale={2} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "360");
    expect(svg).toHaveAttribute("height", "240");
  });
});
