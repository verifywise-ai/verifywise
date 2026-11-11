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

const mockHasPermission = vi.fn((_key: string) => true);
vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  // Not loaded: useCan falls back to the mocked built-in role.
  useMyPermissions: () => ({ permissions: undefined, isLoading: true, error: null }),
}));
vi.mock("../../../../application/hooks/useCan", () => {
  const useCan = (key: string) => mockHasPermission(key);
  return {
    useCan,
    useCanCheck: () => useCan,
    usePermissionsSettled: () => true,
  };
});

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock("../../../../application/hooks/usePolicyTemplates", () => ({
  usePolicyTemplates: vi.fn(),
  useCreatePolicyTemplate: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdatePolicyTemplate: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDeletePolicyTemplate: () => ({ mutateAsync: mockDelete, isPending: false }),
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

const secondSystemTemplate = {
  ...systemTemplate,
  id: 3,
  name: "Data Governance Policy",
  description: "Rules for governing data",
  tags: ["Data governance"],
  category: "Data and security AI policies",
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
    mockHasPermission.mockImplementation(() => true);
    mockNavigate.mockClear();
    mockUsePolicyTemplates.mockReturnValue({
      data: [systemTemplate, secondSystemTemplate, orgTemplate],
      isLoading: false,
    });
  });

  it("renders the system section by default and toggles to our templates", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(screen.queryByText("Internal AI Policy")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /our templates/i }));
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

  it("filters templates by search term", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("Search policy templates"), {
      target: { value: "governance" },
    });
    expect(screen.queryByText("AI Ethics Policy")).not.toBeInTheDocument();
    expect(screen.getByText("Data Governance Policy")).toBeInTheDocument();
  });

  it("redirects to the editor when a composite templateId query param is present", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, {
      route: "/policies/templates?templateId=organization-2",
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/policies/new?templateId=organization-2");
    });
  });

  it("redirects a legacy bare templateId to the editor", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, {
      route: "/policies/templates?templateId=7",
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/policies/new?templateId=7");
    });
  });

  it("ignores a malformed templateId query param", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, {
      route: "/policies/templates?templateId=../../admin",
    });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders tag chips for each template's tags", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(screen.getByText("Fairness")).toBeInTheDocument();
    expect(screen.getByText("Data governance")).toBeInTheDocument();
  });

  it("hides template management without policyTemplate.edit, even for an Admin", async () => {
    mockHasPermission.mockImplementation((key) => key !== "policyTemplate.edit");
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(mockHasPermission).toHaveBeenCalledWith("policyTemplate.edit");
    expect(screen.queryByLabelText("Duplicate AI Ethics Policy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /our templates/i }));
    await waitFor(() => {
      expect(screen.getByText("Internal AI Policy")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Edit Internal AI Policy")).not.toBeInTheDocument();
  });

  it("duplicates a system template into our templates", async () => {
    mockCreate.mockResolvedValue({ id: 9 });
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Duplicate AI Ethics Policy"));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: "AI Ethics Policy (copy)",
        category: "Core AI governance policies",
        description: "Guidance on ethical AI use",
        content: "<p>content 1</p>",
        tags: ["AI ethics", "Fairness"],
      });
    });
    // Duplicating must not open the new-policy editor.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("names a repeat duplicate after the first free copy number", async () => {
    mockUsePolicyTemplates.mockReturnValue({
      data: [
        systemTemplate,
        orgTemplate,
        { ...orgTemplate, id: 4, name: "AI Ethics Policy (copy)" },
        { ...orgTemplate, id: 5, name: "AI Ethics Policy (copy 2)" },
      ],
      isLoading: false,
    });
    mockCreate.mockResolvedValue({ id: 9 });
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Duplicate AI Ethics Policy"));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "AI Ethics Policy (copy 3)" }),
      );
    });
  });

  it("edits an org template's details", async () => {
    mockUpdate.mockResolvedValue({ ...orgTemplate, name: "Renamed policy" });
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    fireEvent.click(screen.getByRole("tab", { name: /our templates/i }));
    await waitFor(() => {
      expect(screen.getByText("Internal AI Policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Edit Internal AI Policy"));
    const nameInput = await screen.findByDisplayValue("Internal AI Policy");
    fireEvent.change(nameInput, { target: { value: "Renamed policy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 2,
        body: {
          name: "Renamed policy",
          description: "Guidance on ethical AI use",
          category: "Core AI governance policies",
        },
      });
    });
  });

  it("opens the content editor for an org template", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    fireEvent.click(screen.getByRole("tab", { name: /our templates/i }));
    await waitFor(() => {
      expect(screen.getByText("Internal AI Policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Edit content of Internal AI Policy"));
    expect(mockNavigate).toHaveBeenCalledWith("/policies/templates/2/edit");
  });

  it("deletes an org template after confirmation", async () => {
    mockDelete.mockResolvedValue({ ok: true });
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    fireEvent.click(screen.getByRole("tab", { name: /our templates/i }));
    await waitFor(() => {
      expect(screen.getByText("Internal AI Policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Delete Internal AI Policy"));
    expect(await screen.findByText("Delete this template?")).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(2);
    });
  });

  it("offers no edit or delete actions on system templates", async () => {
    renderWithProviders(<PolicyTemplates tags={[]} />, { route: "/policies/templates" });
    await waitFor(() => {
      expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Edit AI Ethics Policy")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete AI Ethics Policy")).not.toBeInTheDocument();
  });
});
