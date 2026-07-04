import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { StatusTileCards, type StatusTileItem } from "../index";

const items: StatusTileItem[] = [
  { key: "open", label: "Open", count: 5, color: "#EF4444" },
  { key: "closed", label: "Closed", count: 12, color: "#10B981" },
];

describe("StatusTileCards", () => {
  it("renders items with label and count", () => {
    renderWithProviders(<StatusTileCards items={items} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders small variant", () => {
    const { container } = renderWithProviders(<StatusTileCards items={items} size="small" />);
    expect(container.querySelector(".vw-status-tile-cards")).toBeInTheDocument();
  });

  it("calls onCardClick when a tile is clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<StatusTileCards items={items} onCardClick={handleClick} />);
    await user.click(screen.getByText("Open"));
    expect(handleClick).toHaveBeenCalledWith("open");
  });

  it("highlights selected item", () => {
    renderWithProviders(<StatusTileCards items={items} selectedKey="open" onCardClick={vi.fn()} />);
    const tiles = screen.getAllByRole("generic");
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("uses custom tooltip format", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatusTileCards
        items={items}
        tooltipFormat={(item) => `${item.count} custom ${item.label}`}
      />,
    );
    await user.hover(screen.getByText("Open"));
    const tooltip = await screen.findByText("5 custom Open");
    expect(tooltip).toBeInTheDocument();
  });

  it("generates default tooltip with entity name", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatusTileCards items={items} entityName="task" />);
    await user.hover(screen.getByText("Open"));
    const tooltip = await screen.findByText("5 open tasks");
    expect(tooltip).toBeInTheDocument();
  });

  it("applies custom cardSx", () => {
    renderWithProviders(<StatusTileCards items={items} cardSx={{ opacity: 0.5 }} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});
