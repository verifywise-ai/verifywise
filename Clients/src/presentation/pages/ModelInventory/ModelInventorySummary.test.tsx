import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import ModelInventorySummary from "./ModelInventorySummary";
import type { ModelInventorySummary as Summary } from "../../../domain/interfaces/i.modelInventory";

const summary: Summary = {
  total: 8,
  approved: 3,
  restricted: 2,
  pending: 2,
  blocked: 1,
};

describe("ModelInventorySummary", () => {
  it("renders a tile for every status with its count", () => {
    renderWithProviders(<ModelInventorySummary summary={summary} />);

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Restricted")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("invokes onCardClick with the status key when a card is clicked", () => {
    const onCardClick = vi.fn();
    renderWithProviders(<ModelInventorySummary summary={summary} onCardClick={onCardClick} />);

    fireEvent.click(screen.getByText("Blocked").closest("div")!);
    expect(onCardClick).toHaveBeenCalledWith("blocked");
  });

  it("marks the selected status as active", () => {
    const { container } = renderWithProviders(
      <ModelInventorySummary summary={summary} selectedStatus="approved" />,
    );
    expect(container.querySelectorAll(".vw-status-tile").length).toBe(5);
  });
});
