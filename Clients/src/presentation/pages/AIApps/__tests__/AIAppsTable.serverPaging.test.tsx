import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AIAppsTable from "../AIAppsTable";
import { AiAppStatus } from "../../../../domain/enums/aiApp.enum";
import type { IAIApp } from "../../../../domain/interfaces/i.aiApp";

const app = (id: number): IAIApp =>
  ({
    id,
    organization_id: 1,
    name: `App ${id}`,
    status: AiAppStatus.APPROVED,
    discovered_source: "manual",
  }) as IAIApp;

describe("AIAppsTable with server paging (#5193)", () => {
  it("shows the server page as is and reports page changes", () => {
    const onPageChange = vi.fn();
    renderWithProviders(
      <AIAppsTable
        apps={[app(21), app(22), app(23)]}
        onEditApp={vi.fn()}
        onViewApp={vi.fn()}
        onDeleteApp={vi.fn()}
        serverPaging={{
          total: 23,
          page: 2,
          rowsPerPage: 10,
          onPageChange,
          onRowsPerPageChange: vi.fn(),
          onSortChange: vi.fn(),
        }}
      />,
    );
    // Page 3 of 23 rows: all three rows the server sent, not a client slice.
    expect(screen.getByText("App 21")).toBeInTheDocument();
    expect(screen.getByText("App 23")).toBeInTheDocument();
    expect(screen.getByText(/21 - 23/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
