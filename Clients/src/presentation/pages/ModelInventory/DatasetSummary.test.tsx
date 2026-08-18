import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import DatasetSummary from "./DatasetSummary";
import type { DatasetSummary as Summary } from "../../../domain/interfaces/i.dataset";

const summary: Summary = {
  total: 10,
  draft: 2,
  active: 5,
  deprecated: 2,
  archived: 1,
};

describe("DatasetSummary", () => {
  it("renders a tile for every status with its count", () => {
    renderWithProviders(<DatasetSummary summary={summary} />);

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Deprecated")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("invokes onCardClick with the status key when a card is clicked", () => {
    const onCardClick = vi.fn();
    renderWithProviders(<DatasetSummary summary={summary} onCardClick={onCardClick} />);

    fireEvent.click(screen.getByText("Active").closest("div")!);
    expect(onCardClick).toHaveBeenCalledWith("active");
  });
});
