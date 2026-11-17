import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ScrollableTableContainer from "..";

const widths = (scroll: number, client: number) => {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => scroll,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => client,
  });
};

afterEach(() => {
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("ScrollableTableContainer", () => {
  it("is a focusable, named region while the table overflows", () => {
    widths(964, 908);
    render(<ScrollableTableContainer ariaLabel="Models">rows</ScrollableTableContainer>);
    const region = screen.getByRole("region", { name: "Models" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("adds no tab stop or landmark when the table fits", () => {
    widths(800, 908);
    render(<ScrollableTableContainer ariaLabel="Models">rows</ScrollableTableContainer>);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText("rows")).not.toHaveAttribute("tabindex");
  });
});
