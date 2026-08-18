import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ApiTokenModel } from "../../../../../domain/models/Common/apiToken/apiToken.model";

let mockUserRoleName = "Admin";
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

const mockGetApiTokens = vi.fn();
const mockCreateApiToken = vi.fn();
const mockDeleteApiToken = vi.fn();
const mockRevokeApiToken = vi.fn();

vi.mock("../../../../../application/repository/tokens.repository", () => ({
  getApiTokens: (...args: any[]) => mockGetApiTokens(...args),
  createApiToken: (...args: any[]) => mockCreateApiToken(...args),
  deleteApiToken: (...args: any[]) => mockDeleteApiToken(...args),
  revokeApiToken: (...args: any[]) => mockRevokeApiToken(...args),
}));

vi.mock("../../LLMKeys", () => ({
  default: () => <div data-testid="llm-keys-stub" />,
}));

import ApiKeys from "../index";

const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

const buildToken = (overrides: Partial<ApiTokenModel> = {}) =>
  ApiTokenModel.createNewApiToken({
    id: 1,
    name: "My token",
    expires_at: futureDate,
    created_at: "2025-01-01T00:00:00Z",
    created_by: 1,
    revoked: false,
    last_used_at: null,
    ...overrides,
  } as ApiTokenModel);

describe("ApiKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockGetApiTokens.mockResolvedValue({ data: { data: [] } });
  });

  it("renders the empty state when there are no tokens", async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText("No API keys yet")).toBeInTheDocument();
    });
  });

  it("renders tokens returned by the API", async () => {
    mockGetApiTokens.mockResolvedValue({ data: { data: [buildToken()] } });
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText("My token")).toBeInTheDocument();
    });
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows an expired chip for expired tokens", async () => {
    mockGetApiTokens.mockResolvedValue({
      data: { data: [buildToken({ expires_at: pastDate })] },
    });
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    });
  });

  it("shows a revoked chip for revoked tokens and hides the revoke action", async () => {
    mockGetApiTokens.mockResolvedValue({
      data: { data: [buildToken({ revoked: true })] },
    });
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText("Revoked")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Revoke key")).not.toBeInTheDocument();
  });

  it("shows an error alert when fetching tokens fails", async () => {
    mockGetApiTokens.mockRejectedValue(new Error("boom"));
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText("Failed to fetch API tokens")).toBeInTheDocument();
    });
  });

  it("opens the create modal, validates the name, and creates a token", async () => {
    mockGetApiTokens.mockResolvedValue({ data: { data: [buildToken()] } });
    const user = userEvent.setup();
    renderWithProviders(<ApiKeys />);
    await waitFor(() => expect(screen.getByText("My token")).toBeInTheDocument());

    await user.click(screen.getByText("Create new key"));
    expect(screen.getByText("Create New API Key")).toBeInTheDocument();

    mockCreateApiToken.mockResolvedValue({
      data: { data: { token: "raw-secret-token" } },
    });
    await user.type(screen.getByPlaceholderText("e.g. Production API Key"), "New key");
    await user.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateApiToken).toHaveBeenCalledWith({
        routeUrl: "/tokens",
        body: { name: "New key", expires_in_days: 30 },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("raw-secret-token")).toBeInTheDocument();
    });
  });

  it("closes the created-token modal on 'I copied the key'", async () => {
    mockGetApiTokens.mockResolvedValue({ data: { data: [] } });
    const user = userEvent.setup();
    renderWithProviders(<ApiKeys />);
    await waitFor(() => expect(screen.getByText("No API keys yet")).toBeInTheDocument());

    await user.click(screen.getByText("Create API key"));
    mockCreateApiToken.mockResolvedValue({ data: { data: { token: "abc123" } } });
    await user.type(screen.getByPlaceholderText("e.g. Production API Key"), "New key");
    await user.click(screen.getByText("Create"));

    await waitFor(() => expect(screen.getByText("abc123")).toBeInTheDocument());
    await user.click(screen.getByText("I copied the key"));
    await waitFor(() => {
      expect(screen.queryByText("abc123")).not.toBeInTheDocument();
    });
  });

  it("deletes a token via the delete confirmation modal", async () => {
    mockGetApiTokens.mockResolvedValue({ data: { data: [buildToken()] } });
    mockDeleteApiToken.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ApiKeys />);
    await waitFor(() => expect(screen.getByText("My token")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Delete key"));
    expect(screen.getByText("Delete API Key")).toBeInTheDocument();
    await user.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(mockDeleteApiToken).toHaveBeenCalledWith({ routeUrl: "/tokens/1" });
    });
  });

  it("revokes a token via the revoke confirmation modal", async () => {
    mockGetApiTokens.mockResolvedValue({ data: { data: [buildToken()] } });
    mockRevokeApiToken.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ApiKeys />);
    await waitFor(() => expect(screen.getByText("My token")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Revoke key"));
    expect(screen.getByText("Revoke API Key")).toBeInTheDocument();
    await user.click(screen.getByText("Revoke"));

    await waitFor(() => {
      expect(mockRevokeApiToken).toHaveBeenCalledWith({ routeUrl: "/tokens/1/revoke" });
    });
  });

  it("shows an error alert when delete fails", async () => {
    mockGetApiTokens.mockResolvedValue({ data: { data: [buildToken()] } });
    mockDeleteApiToken.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    renderWithProviders(<ApiKeys />);
    await waitFor(() => expect(screen.getByText("My token")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Delete key"));
    await user.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(screen.getByText("Failed to delete API token")).toBeInTheDocument();
    });
  });

  it("disables management controls for non-admin roles", async () => {
    mockUserRoleName = "Auditor";
    mockGetApiTokens.mockResolvedValue({ data: { data: [buildToken()] } });
    renderWithProviders(<ApiKeys />);
    await waitFor(() => expect(screen.getByText("My token")).toBeInTheDocument());
    expect(screen.getByLabelText("Delete key")).toBeDisabled();
  });

  it("renders the LLMKeys panel", async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByTestId("llm-keys-stub")).toBeInTheDocument();
    });
  });
});
