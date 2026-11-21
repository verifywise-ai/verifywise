import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TabDescription from "../TabDescription";

const TEXTS = {
  "1": "A long description of the first tab that is long enough to wrap onto a second line.",
  "2": "Short.",
  "3": "The third.",
};

// The tab bar under the title moves up and down by a line when the descriptions differ in height.
// jsdom does not lay anything out, so this pins what makes the height hold: every description is
// in the same cell of one grid, and only the open one is seen. The height itself was measured in a
// browser at the widths where the descriptions wrap (the tab bar stood at the same place on all four
// tabs of the Vendors page, where it had moved by a line).
describe("TabDescription", () => {
  it("shows the description of the open tab, and only that one", () => {
    render(<TabDescription texts={TEXTS} active="2" />);

    expect(screen.getByText("Short.")).toBeVisible();
    expect(screen.getByText(TEXTS["1"])).not.toBeVisible();
    expect(screen.getByText(TEXTS["3"])).not.toBeVisible();
  });

  it("keeps every description in the page, so that the cell is as tall as the longest", () => {
    render(<TabDescription texts={TEXTS} active="2" />);

    for (const text of Object.values(TEXTS)) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  // jsdom treats display:none and visibility:hidden alike for toBeVisible, but a browser does not: an
  // item with display:none leaves the grid, and the cell is then only as tall as the open one. That
  // is the jump of the tab bar this component removes, so the hidden ones must keep their place.
  it("hides the others with visibility, not display, so that they keep their height", () => {
    render(<TabDescription texts={TEXTS} active="2" />);

    for (const hidden of [TEXTS["1"], TEXTS["3"]]) {
      const element = screen.getByText(hidden);
      expect(element).toHaveStyle({ visibility: "hidden" });
      expect(element.style.display).not.toBe("none");
    }
    const open = screen.getByText(TEXTS["2"]);
    expect(open).toHaveStyle({ visibility: "visible" });
    expect(open.style.display).not.toBe("none");
  });

  it("lays them all in one cell of a grid", () => {
    render(<TabDescription texts={TEXTS} active="2" />);

    const spans = Object.values(TEXTS).map((text) => screen.getByText(text));
    for (const span of spans) {
      expect(span).toHaveStyle({ gridArea: "1 / 1" });
    }
    const grids = new Set(spans.map((span) => span.parentElement));
    expect(grids.size).toBe(1);
    expect([...grids][0]).toHaveStyle({ display: "grid" });
  });

  it("hides the others from assistive technology, and not the open one", () => {
    render(<TabDescription texts={TEXTS} active="3" />);

    expect(screen.getByText(TEXTS["3"])).not.toHaveAttribute("aria-hidden");
    expect(screen.getByText(TEXTS["1"])).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(TEXTS["2"])).toHaveAttribute("aria-hidden", "true");
  });

  it("follows the open tab", () => {
    const { rerender } = render(<TabDescription texts={TEXTS} active="1" />);
    expect(screen.getByText(TEXTS["1"])).toBeVisible();

    rerender(<TabDescription texts={TEXTS} active="3" />);

    expect(screen.getByText(TEXTS["3"])).toBeVisible();
    expect(screen.getByText(TEXTS["1"])).not.toBeVisible();
  });

  // The header puts the description in a paragraph, where a block element is not allowed.
  it("is made of spans, so that it can stand in a paragraph", () => {
    const { container } = render(
      <p>
        <TabDescription texts={TEXTS} active="1" />
      </p>,
    );

    expect(container.querySelector("p div")).toBeNull();
    expect(container.querySelectorAll("p span").length).toBe(Object.keys(TEXTS).length + 1);
  });
});
