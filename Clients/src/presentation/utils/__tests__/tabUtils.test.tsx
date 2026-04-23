import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createTabLabelWithCount, tabLabelWithCount } from "../tabUtils";

describe("tabLabelWithCount", () => {
  it("renders label text", () => {
    const node = tabLabelWithCount("Vendors");
    render(<>{node}</>);
    expect(screen.getByText("Vendors")).toBeInTheDocument();
  });

  it("renders count when provided", () => {
    const node = tabLabelWithCount("Vendors", 10);
    render(<>{node}</>);
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("does not render count chip when count is undefined", () => {
    const node = tabLabelWithCount("Settings");
    render(<>{node}</>);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("caps display at 99+", () => {
    const node = tabLabelWithCount("Items", 150);
    render(<>{node}</>);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("shows exactly 99 without plus", () => {
    const node = tabLabelWithCount("Items", 99);
    render(<>{node}</>);
    expect(screen.getByText("99")).toBeInTheDocument();
  });
});

describe("createTabLabelWithCount", () => {
  it("hides chip when showZero=false and count=0", () => {
    const node = createTabLabelWithCount({
      label: "Test",
      count: 0,
      showZero: false,
    });
    render(<>{node}</>);
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows chip when showZero=true (default) and count=0", () => {
    const node = createTabLabelWithCount({
      label: "Test",
      count: 0,
    });
    render(<>{node}</>);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("hides chip during loading", () => {
    const node = createTabLabelWithCount({
      label: "Loading",
      count: 5,
      isLoading: true,
    });
    render(<>{node}</>);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    const node = createTabLabelWithCount({
      label: "WithIcon",
      icon: <span data-testid="test-icon">Icon</span>,
    });
    render(<>{node}</>);
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });
});
