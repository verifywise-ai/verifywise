import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual: any = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockIsAdmin = true;
vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin,
}));

const mockGetAllLlmApiKeys = vi.fn();

vi.mock("../../../../application/repository/deepEval.repository", () => ({
  getAllLlmApiKeys: (...args: any[]) => mockGetAllLlmApiKeys(...args),
  addLlmApiKey: vi.fn(),
  deleteLlmApiKey: vi.fn(),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    userId: 1,
    isSuperAdmin: false,
    activeOrganizationId: null,
  }),
}));

vi.mock("../../../../presentation/components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, alert }: any) => (
    <div data-testid="page-header-extended">
      <div data-testid="page-title">{title}</div>
      {alert}
      {children}
    </div>
  ),
}));

import OrgSettings from "../OrgSettings";

describe("OrgSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin = true;
    mockGetAllLlmApiKeys.mockResolvedValue([]);
  });

  it("redirects non-admin users to /evals", () => {
    mockIsAdmin = false;
    renderWithProviders(<OrgSettings />);
    expect(mockNavigate).toHaveBeenCalledWith("/evals", { replace: true });
  });

  it("renders the page title", async () => {
    renderWithProviders(<OrgSettings />);
    expect(screen.getByText("Organization settings")).toBeInTheDocument();
  });

  it("shows gateway down warning when fetch fails with 502", async () => {
    mockGetAllLlmApiKeys.mockRejectedValue({ response: { status: 502 } });
    renderWithProviders(<OrgSettings />);
    await waitFor(() => {
      expect(screen.getByText("AI Gateway is not running")).toBeInTheDocument();
    });
  });

  it("renders saved API keys", async () => {
    mockGetAllLlmApiKeys.mockResolvedValue([
      { id: 1, provider: "openai", maskedKey: "sk-...1234" },
      { id: 2, provider: "anthropic", maskedKey: "sk-ant-...5678" },
    ]);
    renderWithProviders(<OrgSettings />);
    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("sk-...1234")).toBeInTheDocument();
    expect(screen.getByText("sk-ant-...5678")).toBeInTheDocument();
  });

  it("shows all providers configured when all have keys", async () => {
    const allProviders = [
      "openai",
      "anthropic",
      "google",
      "xai",
      "mistral",
      "huggingface",
      "openrouter",
    ];
    mockGetAllLlmApiKeys.mockResolvedValue(
      allProviders.map((p, i) => ({ id: i + 1, provider: p, maskedKey: `...${p}` })),
    );
    renderWithProviders(<OrgSettings />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "All available providers have been configured. Remove a key to add a different one.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("disables add button when provider or key is empty", async () => {
    renderWithProviders(<OrgSettings />);
    await waitFor(() => {
      const addButton = screen.getByText("Add API key").closest("button");
      expect(addButton).toBeDisabled();
    });
  });

  it("shows confirmation dialog when removing a key", async () => {
    mockGetAllLlmApiKeys.mockResolvedValue([
      { id: 1, provider: "openai", maskedKey: "sk-...1234" },
    ]);
    renderWithProviders(<OrgSettings />);
    await waitFor(() => {
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });

    const trashButton = screen.getByRole("button", { name: "" });
    fireEvent.click(trashButton);
    await waitFor(() => {
      expect(screen.getByText("Remove API key")).toBeInTheDocument();
    });
  });
});
