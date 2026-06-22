import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LazyFallback } from "../lazyRoute";

describe("LazyFallback", () => {
  it("renders CircularProgress inside centered Box", () => {
    const { container } = render(React.createElement(LazyFallback));
    const box = container.firstChild as HTMLElement;
    expect(box).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
