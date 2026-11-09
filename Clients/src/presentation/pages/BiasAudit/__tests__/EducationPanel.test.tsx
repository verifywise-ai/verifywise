import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EducationPanel from "../EducationPanel";

describe("EducationPanel", () => {
  it("starts closed and opens on click", () => {
    render(<EducationPanel pageKey="results.figures" />);
    const toggle = screen.getByRole("button", { name: /why this matters/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("renders all three elements for a page", () => {
    render(<EducationPanel pageKey="results.figures" />);
    expect(screen.getByText("What it decides")).toBeInTheDocument();
    expect(screen.getByText("The rule")).toBeInTheDocument();
    expect(screen.getByText("Common mistakes")).toBeInTheDocument();
  });

  it("shows the statutory references", () => {
    render(<EducationPanel pageKey="results.figures" />);
    expect(screen.getByText("§ 5-301(c) · § 5-301(d)")).toBeInTheDocument();
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
