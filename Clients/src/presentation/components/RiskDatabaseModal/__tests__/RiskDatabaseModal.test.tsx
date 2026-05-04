import { vi } from "vitest";

vi.mock("../../Modals/StandardModal", () => {
  const StandardModal = ({ open, children, title }: any) =>
    open ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null;
  return { default: StandardModal };
});
vi.mock("../../EmptyState", () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock("../../Search", () => ({
  SearchBox: (_props: any) => <input data-testid="search-box" />,
}));

import { screen as _screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RiskDatabaseModal from "../index";

describe("RiskDatabaseModal", () => {
  const defaultProps = {
    isOpen: true,
    setIsOpen: vi.fn(),
    riskData: [] as any[],
    mapSeverity: vi.fn(),
    mapLikelihood: vi.fn(),
    title: "Select a risk",
    description: "Choose from the database",
    databaseName: "Test DB",
  };

  it("renders without crashing when open", () => {
    renderWithProviders(<RiskDatabaseModal {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });
});
