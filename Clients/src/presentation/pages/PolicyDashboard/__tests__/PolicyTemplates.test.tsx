import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));

vi.mock("../../../../application/hooks/usePolicyTemplates", () => ({
  usePolicyTemplates: vi.fn(),
  useCreatePolicyTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePolicyTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePolicyTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../../components/Table/PolicyTable", () => ({
  default: ({ data, renderRow }: any) => (
    <table>
      <tbody>{data.rows.map((row: any) => renderRow(row, undefined))}</tbody>
    </table>
  ),
}));

import PolicyTemplates from "../PolicyTemplates";
import { usePolicyTemplates } from "../../../../application/hooks/usePolicyTemplates";

const systemTemplate = {
  id: 1,
  organization_id: null,
  name: "AI Ethics Policy",
  description: "Guidance on ethical AI use",
  tags: ["AI ethics", "Fairness"],
  category: "Core AI governance policies",
  content: "<p>content 1</p>",
  is_system_template: true,
  is_active: true,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const orgTemplate = {
  ...systemTemplate,
  id: 2,
  organization_id: 7,
  name: "Internal AI Policy",
  is_system_template: false,
};

const mockUsePolicyTemplates = usePolicyTemplates as unknown as ReturnType<typeof vi.fn>;

describe("PolicyTemplates (#5261)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockUsePolicyTemplates.mockReturnValue({
      data: [systemTemplate, orgTemplate],
      isLoading: false,
    });
  });

  it("renders the system section by default and toggles to our templates", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(screen.queryByText("Internal AI Policy")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /our templates/i }));
    await waitFor(() => {
      expect(screen.getByText("Internal AI Policy")).toBeInTheDocument();
    });
    expect(screen.queryByText("AI Ethics Policy")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton while the query is loading", () => {
    mockUsePolicyTemplates.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<PolicyTemplates tags={[]} isLoading />, {
      route: "/policies/templates",
    });
    expect(screen.queryByText("AI Ethics Policy")).not.toBeInTheDocument();
  });

  it("shows an empty state message when there are no templates", async () => {
    mockUsePolicyTemplates.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("No policy templates found.")).toBeInTheDocument();
    });
  });

  it("navigates to the new-policy editor with a composite template id", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("AI Ethics Policy"));
    expect(mockNavigate).toHaveBeenCalledWith("/policies/new?templateId=system-1");
  });
});
