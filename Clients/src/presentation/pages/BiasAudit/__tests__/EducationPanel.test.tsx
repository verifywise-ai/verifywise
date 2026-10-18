import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EducationPanel from "../EducationPanel";

describe("EducationPanel", () => {
  it("renders all three elements for a page", () => {
    render(<EducationPanel pageKey="results.figures" />);
    expect(screen.getByText(/what this page decides/i)).toBeInTheDocument();
    expect(screen.getByText(/why the law cares/i)).toBeInTheDocument();
    expect(screen.getByText(/what goes wrong/i)).toBeInTheDocument();
  });

  it("shows the statutory references", () => {
    render(<EducationPanel pageKey="results.figures" />);
    // The reference appears in the law text and again as its own reference.
    expect(screen.getAllByText(/5-301\(c\)/).length).toBeGreaterThan(0);
    expect(screen.getByText("§ 5-301(c)")).toBeInTheDocument();
    expect(screen.getByText("§ 5-301(d)")).toBeInTheDocument();
  });

  it("states a non-statutory page as such, with no references", () => {
    render(<EducationPanel pageKey="run.knockout" />);
    expect(screen.getByText(/not a statutory item/i)).toBeInTheDocument();
    expect(screen.queryByText(/^§ /)).not.toBeInTheDocument();
  });

  it("renders nothing rather than throwing for an unknown page", () => {
    const { container } = render(<EducationPanel pageKey="nope" />);
    expect(container).toBeEmptyDOMElement();
  });
});
