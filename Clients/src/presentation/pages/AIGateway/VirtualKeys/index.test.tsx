import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, actionButton }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actionButton}
      {children}
    </div>
  ),
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import VirtualKeysPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;

function makeKey(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    key_prefix: "vk_abc123",
    name: "Backend key",
    allowed_endpoint_ids: [],
    allowed_models: [],
    blocked_models: [],
    allowed_providers: [],
    blocked_providers: [],
    max_budget_usd: null,
    current_spend_usd: 0,
    rate_limit_rpm: null,
    metadata: {},
    expires_at: null,
    is_active: true,
    revoked_at: null,
    created_by_name: "Jane Doe",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockLoad(keys: any[], endpoints: any[] = [{ id: 1, is_active: true }]) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/ai-gateway/virtual-keys")) {
      return Promise.resolve({ data: { data: keys } });
    }
    if (url.includes("/ai-gateway/endpoints")) {
      return Promise.resolve({ data: { endpoints } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("AIGateway - VirtualKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<VirtualKeysPage />, { route: "/ai-gateway/mcp/virtual-keys" });
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load virtual keys. Please try again."),
      ).toBeInTheDocument();
    });

    mockLoad([makeKey()]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Backend key")).toBeInTheDocument();
    });
  });

  it("shows an empty state with an endpoint warning when there are no endpoints", async () => {
    mockLoad([], []);
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Give your developers a single API key/),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("No endpoints configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
  });

  it("shows an empty state without the endpoint warning when endpoints exist", async () => {
    mockLoad([]);
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Give your developers a single API key/),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("No endpoints configured")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).not.toBeDisabled();
  });

  it("renders key rows with prefix, budget, rate limit, and model chips", async () => {
    mockLoad([
      makeKey({
        max_budget_usd: 50,
        current_spend_usd: 12.5,
        rate_limit_rpm: 60,
        allowed_models: ["gpt-4o-mini"],
        blocked_models: ["gpt-4o"],
        allowed_providers: ["openai"],
        blocked_providers: ["openrouter"],
      }),
    ]);
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Backend key")).toBeInTheDocument();
    });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("vk_abc123")).toBeInTheDocument();
    expect(screen.getByText("$12.5000 / $50.00")).toBeInTheDocument();
    expect(screen.getByText("60 RPM")).toBeInTheDocument();
    expect(screen.getByText("models: gpt-4o-mini")).toBeInTheDocument();
    expect(screen.getByText("blocked: gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("providers: openai")).toBeInTheDocument();
    expect(screen.getByText("blocked providers: openrouter")).toBeInTheDocument();
  });

  it("shows a Revoked status for revoked keys and a Delete action for inactive keys", async () => {
    mockLoad([
      makeKey({ id: 2, name: "Old key", is_active: false, revoked_at: "2025-02-01T00:00:00Z" }),
    ]);
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Old key")).toBeInTheDocument();
    });

    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete key" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke key" })).not.toBeInTheDocument();
  });

  it("shows an Expired status when expires_at is in the past", async () => {
    mockLoad([makeKey({ expires_at: "2000-01-01T00:00:00Z" })]);
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Expired")).toBeInTheDocument();
    });
  });

  it("validates that a name is required before creating a key", async () => {
    mockLoad([]);
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create key" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(screen.getByRole("heading", { name: "Create virtual key" })).toBeInTheDocument();

    const submitButtons = screen.getAllByRole("button", { name: "Create key" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("creates a key and shows the plaintext key display modal", async () => {
    mockLoad([]);
    mockPost.mockResolvedValue({ data: { data: { id: 9, plain_key: "vk_plaintext_secret" } } });
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create key" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "New key" } });
    fireEvent.change(screen.getByLabelText(/^Monthly budget/), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText(/^Rate limit/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/^Allowed models/), {
      target: { value: "gpt-4o-mini, gpt-4o" },
    });

    const submitButtons = screen.getAllByRole("button", { name: "Create key" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/virtual-keys",
        expect.objectContaining({
          name: "New key",
          max_budget_usd: 25,
          rate_limit_rpm: 10,
          allowed_models: ["gpt-4o-mini", "gpt-4o"],
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Virtual key created" })).toBeInTheDocument();
    });
    expect(screen.getByText("vk_plaintext_secret")).toBeInTheDocument();
  });

  it("copies the newly created key to the clipboard", async () => {
    mockLoad([]);
    mockPost.mockResolvedValue({ data: { data: { id: 9, plain_key: "vk_plaintext_secret" } } });
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create key" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "New key" } });
    const submitButtons = screen.getAllByRole("button", { name: "Create key" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Virtual key created" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    expect(writeTextSpy).toHaveBeenCalledWith("vk_plaintext_secret");
  });

  it("shows the API error message when create submission fails", async () => {
    mockLoad([]);
    mockPost.mockRejectedValue({ response: { data: { detail: "Budget must be positive" } } });
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create key" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Bad key" } });
    const submitButtons = screen.getAllByRole("button", { name: "Create key" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Budget must be positive")).toBeInTheDocument();
    });
  });

  it("revokes an active key via the confirmation modal", async () => {
    mockLoad([makeKey()]);
    mockPost.mockResolvedValue({ data: {} });
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Backend key")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));

    expect(
      screen.getByText(/Are you sure you want to revoke "Backend key"/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/virtual-keys/1/revoke");
    });
  });

  it("deletes an inactive key directly", async () => {
    mockLoad([makeKey({ id: 2, name: "Old key", is_active: false })]);
    mockDelete.mockResolvedValue({ data: {} });
    renderWithProviders(<VirtualKeysPage />);

    await waitFor(() => {
      expect(screen.getByText("Old key")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete key" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/virtual-keys/2");
    });
  });

  it("renders in embedded mode within a card, without the page header", async () => {
    mockLoad([]);
    renderWithProviders(<VirtualKeysPage embedded />);

    await waitFor(() => {
      expect(screen.getByText("Virtual keys")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("page-header")).not.toBeInTheDocument();
  });
});
