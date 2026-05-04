import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import VWTooltip from "../index";

describe("VWTooltip Component", () => {
  it("renders the children element", () => {
    renderWithProviders(
      <VWTooltip content="Tooltip text">
        <button>Hover me</button>
      </VWTooltip>,
    );

    expect(screen.getByRole("button", { name: /hover me/i })).toBeInTheDocument();
  });

  it("renders children without crashing when header is provided", () => {
    renderWithProviders(
      <VWTooltip content="Body content" header="Header text">
        <span>Trigger</span>
      </VWTooltip>,
    );

    expect(screen.getByText("Trigger")).toBeInTheDocument();
  });

  it("renders children with custom placement and maxWidth", () => {
    renderWithProviders(
      <VWTooltip content="Content" placement="bottom" maxWidth={300}>
        <div>Target element</div>
      </VWTooltip>,
    );

    expect(screen.getByText("Target element")).toBeInTheDocument();
  });

  it("renders children with arrow disabled", () => {
    renderWithProviders(
      <VWTooltip content="No arrow" arrow={false}>
        <span>No arrow trigger</span>
      </VWTooltip>,
    );

    expect(screen.getByText("No arrow trigger")).toBeInTheDocument();
  });
});
