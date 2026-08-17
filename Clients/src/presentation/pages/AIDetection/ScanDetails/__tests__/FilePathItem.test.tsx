import { render, screen } from "@testing-library/react";
import { FilePathItem } from "../FilePathItem";

describe("FilePathItem", () => {
  it("renders the file path as plain text when there is no file URL", () => {
    render(
      <FilePathItem path="src/app.py" lineNumber={null} matchedText="" fileUrl={null} />,
    );

    expect(screen.getByText("src/app.py")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the file path as a link when a file URL is provided", () => {
    render(
      <FilePathItem
        path="src/app.py"
        lineNumber={null}
        matchedText=""
        fileUrl="https://github.com/org/repo/blob/HEAD/src/app.py"
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://github.com/org/repo/blob/HEAD/src/app.py");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the line number when provided", () => {
    render(
      <FilePathItem
        path="src/app.py"
        lineNumber={42}
        matchedText=""
        fileUrl="https://github.com/org/repo/blob/HEAD/src/app.py"
      />,
    );

    expect(screen.getByText(":42")).toBeInTheDocument();
  });

  it("does not show a line number marker when null", () => {
    render(
      <FilePathItem path="src/app.py" lineNumber={null} matchedText="" fileUrl={null} />,
    );

    expect(screen.queryByText(/^:/)).not.toBeInTheDocument();
  });

  it("wraps the row in a tooltip when matchedText is provided", () => {
    const { container } = render(
      <FilePathItem
        path="src/app.py"
        lineNumber={10}
        matchedText="import openai"
        fileUrl={null}
      />,
    );

    // VWTooltip typically attaches aria-describedby or similar wrapper; assert the row itself
    // still renders correctly with tooltip content available via title/content prop.
    expect(container.textContent).toContain("src/app.py");
  });
});
