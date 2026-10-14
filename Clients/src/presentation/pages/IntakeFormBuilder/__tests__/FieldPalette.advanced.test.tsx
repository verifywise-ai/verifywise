import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FieldPalette } from "../FieldPalette";

describe("FieldPalette advanced section", () => {
  it("keeps Calculated out of the main list until Advanced is opened", () => {
    const onAddField = vi.fn();
    renderWithProviders(<FieldPalette onAddField={onAddField} fieldCount={3} />);
    expect(screen.getByText("Short text")).toBeVisible();
    expect(screen.queryByText("Calculated")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    fireEvent.click(screen.getByText("Calculated"));
    expect(onAddField).toHaveBeenCalledWith(
      expect.objectContaining({ type: "calculated", formula: "", decimals: 2, order: 3 }),
    );
  });
});
