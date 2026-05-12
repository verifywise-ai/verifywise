import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import BottomChip from "../index";

describe("BottomChip", () => {
  it("renders its children", () => {
    renderWithProviders(
      <BottomChip>
        <span>chip content</span>
      </BottomChip>,
    );

    expect(screen.getByText("chip content")).toBeInTheDocument();
  });

  it("applies the role and aria-label when provided", () => {
    renderWithProviders(
      <BottomChip role="toolbar" ariaLabel="Bulk actions">
        <span>content</span>
      </BottomChip>,
    );

    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toBeInTheDocument();
  });

  it("merges a passed-in sx prop onto the pill", () => {
    renderWithProviders(
      <BottomChip role="toolbar" ariaLabel="styled" sx={{ backgroundColor: "rgb(1, 2, 3)" }}>
        <span>content</span>
      </BottomChip>,
    );

    const pill = screen.getByRole("toolbar", { name: "styled" });
    expect(pill).toHaveStyle({ backgroundColor: "rgb(1, 2, 3)" });
  });
});
