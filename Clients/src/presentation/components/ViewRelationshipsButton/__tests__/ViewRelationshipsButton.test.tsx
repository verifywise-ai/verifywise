import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ViewRelationshipsButton from "../index";

// Mock EntityGraphModal
vi.mock("../../EntityGraphModal", () => ({
  EntityGraphModal: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
    focusEntityId: string | number;
    focusEntityType: string;
    focusEntityLabel?: string;
  }) =>
    open ? (
      <div data-testid="entity-graph-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
  // Re-export the type so the import doesn't break
}));

// Mock VWTooltip
vi.mock("../../VWTooltip", () => ({
  default: ({ children, content }: { children: React.ReactNode; content: string }) => (
    <div title={content}>{children}</div>
  ),
}));

describe("ViewRelationshipsButton", () => {
  const defaultProps = {
    entityId: 1,
    entityType: "model" as const,
    entityLabel: "Test Model",
  };

  it("renders the button", () => {
    renderWithProviders(<ViewRelationshipsButton {...defaultProps} />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("opens the modal on click", () => {
    renderWithProviders(<ViewRelationshipsButton {...defaultProps} />);

    expect(screen.queryByTestId("entity-graph-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByTestId("entity-graph-modal")).toBeInTheDocument();
  });

  it("closes the modal when close is triggered", () => {
    renderWithProviders(<ViewRelationshipsButton {...defaultProps} />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("entity-graph-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByTestId("entity-graph-modal")).not.toBeInTheDocument();
  });

  it("renders with custom tooltip text", () => {
    renderWithProviders(<ViewRelationshipsButton {...defaultProps} tooltipText="Show graph" />);
    expect(screen.getByTitle("Show graph")).toBeInTheDocument();
  });

  it("renders with default tooltip text", () => {
    renderWithProviders(<ViewRelationshipsButton {...defaultProps} />);
    expect(screen.getByTitle("View relationships")).toBeInTheDocument();
  });
});
