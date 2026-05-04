import { vi } from "vitest";

vi.mock("../../Modals/StandardModal", () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock("../../Chip", () => ({
  default: ({ label }: any) => <span data-testid="chip">{label}</span>,
}));
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
  updateEntityById: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../Modals/NewModelRisk", () => ({
  default: () => <div data-testid="new-model-risk" />,
}));
vi.mock("../../../themes/v1SingleTheme", () => ({
  default: {
    textStyles: { bodyLarge: {} },
    tableStyles: { primary: { frame: {}, header: {}, cell: {} } },
  },
}));
vi.mock("../../Table/styles", () => ({
  tableWrapper: () => ({}),
  paginationDropdown: {},
  paginationSelect: {},
  paginationStyle: {},
}));
vi.mock("../../EmptyState", () => ({
  EmptyState: () => <div data-testid="empty-state">No risks</div>,
}));
vi.mock("../../TablePagination", () => ({
  default: () => <div data-testid="table-pagination" />,
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ModelRisksDialog from "../index";

describe("ModelRisksDialog", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    modelId: 1,
    modelName: "Test Model",
  };

  it("renders when open", () => {
    renderWithProviders(<ModelRisksDialog {...defaultProps} />);
    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderWithProviders(<ModelRisksDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId("standard-modal")).not.toBeInTheDocument();
  });
});
