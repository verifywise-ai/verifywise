import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ScoreBreakdown } from "../ScoreBreakdown";

describe("ScoreBreakdown", () => {
  it("renders a domain header and labels a half award 'Partial' (not 'Disclosed')", () => {
    renderWithProviders(<ScoreBreakdown appName="X" indicators={{ "D1.1": { award: "half" } }} />);
    expect(screen.getByText(/Training-data use/i)).toBeInTheDocument();
    // The half indicator row must show "Partial" — at least one element in the indicator checklist
    expect(screen.getAllByText("Partial").length).toBeGreaterThan(0);
    // The half indicator row must NOT show "Disclosed" — only the legend may show it (1 element).
    // If a half row were mislabeled "Disclosed" there would be 2+ "Disclosed" elements.
    expect(screen.getAllByText("Disclosed").length).toBe(1);
  });
});
