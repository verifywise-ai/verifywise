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

const mockDefs = [
  { id: 11, label: "Business unit", field_type: "text", required: false, options: null },
];
vi.mock("../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: (entityType: string) => ({
    data: entityType === "ai_app" ? mockDefs : [],
  }),
}));

describe("AIAppsTable custom field columns (#5262)", () => {
  it("shows a column per definition with the row value from custom_fields", () => {
    renderWithProviders(
      <AIAppsTable
        apps={[
          {
            ...app(1),
            custom_fields: [{ definition_id: 11, value: "Finance" }],
          } as IAIApp,
          app(2),
        ]}
        onEditApp={vi.fn()}
        onViewApp={vi.fn()}
        onDeleteApp={vi.fn()}
      />,
    );
    expect(screen.getByText("Business unit")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });
});
