import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import MappingMatrixView from "../MappingMatrixView";

const mappings = [
  { source_framework_id: 1, target_framework_id: 2 },
  { source_framework_id: 1, target_framework_id: 2 },
  { source_framework_id: 2, target_framework_id: 3 },
] as any[];

describe("MappingMatrixView", () => {
  it("renders the framework axis labels", () => {
    renderWithProviders(<MappingMatrixView mappings={[]} onCellClick={vi.fn()} />);

    expect(screen.getAllByText("EU AI Act").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ISO 42001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ISO 27001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NIST AI RMF").length).toBeGreaterThan(0);
  });

  it("shows the mapping count in the matching cell", () => {
    renderWithProviders(<MappingMatrixView mappings={mappings} onCellClick={vi.fn()} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("calls onCellClick when a populated non-diagonal cell is clicked", () => {
    const onCellClick = vi.fn();
    renderWithProviders(<MappingMatrixView mappings={mappings} onCellClick={onCellClick} />);

    fireEvent.click(screen.getByText("2"));

    expect(onCellClick).toHaveBeenCalledWith(1, 2);
  });

  it("does not call onCellClick for empty cells", () => {
    const onCellClick = vi.fn();
    renderWithProviders(<MappingMatrixView mappings={[]} onCellClick={onCellClick} />);

    const dashes = screen.getAllByText("—");
    fireEvent.click(dashes[0]);

    expect(onCellClick).not.toHaveBeenCalled();
  });

  it("renders the density legend", () => {
    renderWithProviders(<MappingMatrixView mappings={mappings} onCellClick={vi.fn()} />);

    expect(screen.getByText("Density:")).toBeInTheDocument();
    expect(screen.getByText("Low → High")).toBeInTheDocument();
  });
});
