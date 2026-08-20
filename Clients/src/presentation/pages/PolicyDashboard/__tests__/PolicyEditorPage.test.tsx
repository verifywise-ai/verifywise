import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Keep real Extension/NodeViewWrapper/ReactNodeViewRenderer (needed by
// searchHighlightExtension.ts and AuthImage.tsx), only neuter the parts that
// need a real DOM-mounted ProseMirror instance.
vi.mock("@tiptap/react", async () => {
  const actual: any = await vi.importActual("@tiptap/react");
  return {
    ...actual,
    useEditor: vi.fn(() => null),
    EditorContent: ({ editor }: any) => (
      <div data-testid="editor-content">{editor ? "loaded" : "empty"}</div>
    ),
  };
});

let mockUsers: any[] = [];
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers, loading: false, error: null, refreshUsers: vi.fn() }),
}));

vi.mock("../../../../application/hooks/usePolicyChangeHistory", () => ({
  usePolicyChangeHistory: () => ({}),
}));

vi.mock("../../../components/CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({
    blocked: false,
    reason: null,
    missingLabels: [],
    onPendingChange: vi.fn(),
  }),
}));

vi.mock("../../../components/CustomFieldsSection", () => ({
  default: React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      hasPendingValues: () => false,
      flush: vi.fn(),
    }));
    return <div data-testid="custom-fields-section" />;
  }),
}));

const mockSetFormData = vi.fn();
vi.mock("../../../components/Policies/PolicyForm", () => ({
  default: ({ formData, setFormData }: any) => (
    <div data-testid="policy-form">
      <span data-testid="form-title">{formData.title}</span>
      <button
        data-testid="fill-valid-form"
        onClick={() => {
          mockSetFormData((prev: any) => ({
            ...prev,
            title: "AI Ethics Policy",
            tags: ["AI ethics"],
            nextReviewDate: "2026-01-01",
          }));
          setFormData((prev: any) => ({
            ...prev,
            title: "AI Ethics Policy",
            tags: ["AI ethics"],
            nextReviewDate: "2026-01-01",
          }));
        }}
      >
        fill valid form
      </button>
    </div>
  ),
}));

vi.mock("../../../components/Modals/InsertLinkModal/InsertLinkModal", () => ({
  default: ({ open }: any) => (open ? <div data-testid="insert-link-modal" /> : null),
}));

vi.mock("../../../components/Dialogs/ConfirmationModal", () => ({
  default: ({ isOpen }: any) => (isOpen ? <div data-testid="confirmation-modal" /> : null),
}));

vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="page-breadcrumbs" />,
}));

vi.mock("../../../components/Common/HistorySidebar", () => ({
  HistorySidebar: ({ isOpen }: any) => (isOpen ? <div data-testid="history-sidebar" /> : null),
}));

const mockGetPolicyById = vi.fn();
const mockGetAllTags = vi.fn();
const mockImportDocxToHtml = vi.fn();
const mockCreatePolicy = vi.fn();
const mockUpdatePolicy = vi.fn();
vi.mock("../../../../application/repository/policy.repository", () => ({
  getPolicyById: (...args: any[]) => mockGetPolicyById(...args),
  getAllTags: (...args: any[]) => mockGetAllTags(...args),
  importDocxToHtml: (...args: any[]) => mockImportDocxToHtml(...args),
  createPolicy: (...args: any[]) => mockCreatePolicy(...args),
  updatePolicy: (...args: any[]) => mockUpdatePolicy(...args),
}));

const mockUploadFileToManager = vi.fn();
vi.mock("../../../../application/repository/file.repository", () => ({
  uploadFileToManager: (...args: any[]) => mockUploadFileToManager(...args),
}));

import PolicyEditorPage from "../PolicyEditorPage";

describe("PolicyEditorPage", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; the save-validation path calls it.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers = [];
    mockGetAllTags.mockResolvedValue(["AI ethics", "Privacy"]);
    mockCreatePolicy.mockResolvedValue({ id: 42, title: "AI Ethics Policy" });
  });

  it("shows a loading skeleton while tags are being fetched", () => {
    mockGetAllTags.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    expect(screen.queryByTestId("policy-form")).not.toBeInTheDocument();
  });

  it("renders the new-policy header, form and editor once loaded", async () => {
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    await waitFor(() => {
      expect(screen.getByText("New policy")).toBeInTheDocument();
    });
    expect(screen.getByTestId("policy-form")).toBeInTheDocument();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    expect(screen.getByTestId("custom-fields-section")).toBeInTheDocument();
    expect(screen.getByTestId("page-breadcrumbs")).toBeInTheDocument();
  });

  it("does not show history/export/import actions for a brand new policy", async () => {
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    await waitFor(() => {
      expect(screen.getByText("New policy")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Activity history")).not.toBeInTheDocument();
    expect(screen.queryByText("Export")).not.toBeInTheDocument();
  });

  it("shows a load error state when fetching tags fails", async () => {
    mockGetAllTags.mockRejectedValue(new Error("network error"));
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    await waitFor(() => {
      expect(screen.getByText("Failed to load tags.")).toBeInTheDocument();
    });
    expect(screen.getByText("Back to policies")).toBeInTheDocument();
  });

  it("navigates back to the policies list from the error state", async () => {
    mockGetAllTags.mockRejectedValue(new Error("network error"));
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    await waitFor(() => {
      expect(screen.getByText("Back to policies")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Back to policies"));
    expect(mockNavigate).toHaveBeenCalledWith("/policies");
  });

  it("shows a validation snackbar when saving with required fields missing", async () => {
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    await waitFor(() => {
      expect(screen.getByTestId("policy-form")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(
        screen.getByText("Please fill in all required fields before saving."),
      ).toBeInTheDocument();
    });
    expect(mockCreatePolicy).not.toHaveBeenCalled();
  });

  it("creates the policy and navigates to its edit URL when saved with valid data", async () => {
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    await waitFor(() => {
      expect(screen.getByTestId("policy-form")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("fill-valid-form"));
    await waitFor(() =>
      expect(screen.getByTestId("form-title").textContent).toBe("AI Ethics Policy"),
    );

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockCreatePolicy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/policies/42/edit", { replace: true });
    });
  });

  it("navigates back to policies when the back button is clicked", async () => {
    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new" });
    await waitFor(() => {
      expect(screen.getByText("New policy")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /back to policies/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/policies");
  });

  it("loads a template's content from the templateId query param", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve([
          {
            id: 5,
            title: "Data Governance Template",
            tags: ["Data governance"],
            content: "<p>t</p>",
          },
        ]),
    }) as any;

    renderWithProviders(<PolicyEditorPage />, { route: "/policies/new?templateId=5" });

    await waitFor(() => {
      expect(screen.getByText("New policy from template")).toBeInTheDocument();
    });
  });
});
