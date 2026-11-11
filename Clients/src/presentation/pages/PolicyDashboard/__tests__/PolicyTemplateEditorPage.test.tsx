import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockRole = "Admin";
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockRole }),
}));

// A minimal editor stand-in: the page only needs getHTML/setEditable.
const mockEditor = {
  getHTML: vi.fn(() => "<p>edited body</p>"),
  setEditable: vi.fn(),
  isEmpty: false,
};
vi.mock("@tiptap/react", async () => {
  const actual: any = await vi.importActual("@tiptap/react");
  return {
    ...actual,
    useEditor: vi.fn(() => mockEditor),
    EditorContent: () => <div data-testid="editor-content" />,
  };
});
vi.mock("../PolicyEditor/usePolicyFindReplace", () => ({
  usePolicyFindReplace: () => ({}),
}));
vi.mock("../PolicyEditor/PolicyContentEditor", () => ({
  PolicyContentEditor: ({ readOnly }: any) => (
    <div data-testid="content-editor" data-readonly={String(readOnly)} />
  ),
}));

const mockUpdate = vi.fn();
let mockTemplateResult: any;
vi.mock("../../../../application/hooks/usePolicyTemplates", () => ({
  usePolicyTemplate: () => mockTemplateResult,
  useUpdatePolicyTemplate: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

import PolicyTemplateEditorPage from "../PolicyTemplateEditorPage";

const orgTemplate = {
  id: 2,
  organization_id: 7,
  name: "Internal AI Policy",
  description: null,
  tags: [],
  category: "Core AI governance policies",
  content: "<p>original</p>",
  is_system_template: false,
  is_active: true,
  created_by: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/policies/templates/:templateId/edit" element={<PolicyTemplateEditorPage />} />
    </Routes>,
    { route },
  );

describe("PolicyTemplateEditorPage (#5261)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = "Admin";
    mockTemplateResult = { data: orgTemplate, isLoading: false, isError: false };
  });

  it("saves the editor HTML as the org template's content", async () => {
    mockUpdate.mockResolvedValue(orgTemplate);
    renderAt("/policies/templates/2/edit");
    expect(screen.getByText("Internal AI Policy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save template/i }));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 2,
        body: { content: "<p>edited body</p>" },
      });
    });
  });

  it("opens a system template read-only, with no save button", () => {
    mockTemplateResult = {
      data: { ...orgTemplate, id: 1, organization_id: null, is_system_template: true },
      isLoading: false,
      isError: false,
    };
    renderAt("/policies/templates/1/edit");
    expect(screen.queryByRole("button", { name: /save template/i })).not.toBeInTheDocument();
    expect(screen.getByText(/system templates are read-only/i)).toBeInTheDocument();
    expect(mockEditor.setEditable).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("content-editor")).toHaveAttribute("data-readonly", "true");
  });

  it("is read-only for roles that cannot manage templates", () => {
    mockRole = "Auditor";
    renderAt("/policies/templates/2/edit");
    expect(screen.queryByRole("button", { name: /save template/i })).not.toBeInTheDocument();
  });

  it("shows a load error for a non-numeric id", () => {
    mockTemplateResult = { data: undefined, isLoading: false, isError: false };
    renderAt("/policies/templates/abc/edit");
    expect(screen.getByText(/failed to load template/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to policy templates/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/policies/templates");
  });
});
