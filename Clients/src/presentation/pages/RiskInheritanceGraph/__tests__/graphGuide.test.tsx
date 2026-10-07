import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import GraphGuide, { NODE_LEGEND } from "../GraphGuide";

describe("GraphGuide", () => {
  it("keys every node type in one compact strip", () => {
    renderWithProviders(<GraphGuide />);
    for (const entry of NODE_LEGEND) {
      expect(screen.getByText(entry.label)).toBeInTheDocument();
    }
    expect(NODE_LEGEND.map((entry) => entry.entityType)).toEqual([
      "risk",
      "model_risk",
      "vendor_risk",
    ]);
  });

  it("explains the map, including the stale-parent badge, behind the info icon", async () => {
    renderWithProviders(<GraphGuide />);
    expect(screen.queryByText(/Each box is a risk/)).not.toBeInTheDocument();

    await userEvent.hover(screen.getByLabelText("What is this map?"));
    expect(await screen.findByText(/Each box is a risk/)).toBeInTheDocument();
    expect(screen.getByText(/Parent level changed/)).toBeInTheDocument();
  });
});
