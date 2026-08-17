import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// ─── Mocks ──────────────────────────────────────────────────────────────────

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
      <div data-testid="action-button">{actionButton}</div>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/EmptyState", () => ({
  EmptyState: ({ message, children }: any) => (
    <div data-testid="empty-state">
      <p>{message}</p>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/EmptyState/EmptyStateTip", () => ({
  default: ({ title }: any) => <div data-testid="empty-state-tip">{title}</div>,
}));

vi.mock("../../../components/Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import EndpointsPage from "./index";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const mockApiKeys = [
  { id: 1, key_name: "OpenAI Key", provider: "openai", is_active: true },
  { id: 2, key_name: "Old Key", provider: "openai", is_active: false },
];

const mockEndpoints = [
  {
    id: 1,
    display_name: "Production GPT-4o",
    slug: "production-gpt-4o",
    provider: "openai",
    model: "openai/gpt-4o",
    api_key_id: 1,
    api_key_name: "OpenAI Key",
    max_tokens: 4096,
    temperature: 0.7,
    system_prompt: "",
    rate_limit_rpm: 60,
    fallback_endpoint_id: null,
    prompt_id: null,
    prompt_label: "production",
    cache_enabled: true,
    cache_ttl_seconds: 7200,
    is_active: true,
    created_by_name: "Jane Doe",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 2,
    display_name: "Fallback Claude",
    slug: "fallback-claude",
    provider: "anthropic",
    model: "anthropic/claude-3",
    api_key_id: 1,
    api_key_name: "OpenAI Key",
    max_tokens: null,
    temperature: null,
    system_prompt: "",
    rate_limit_rpm: 0,
    fallback_endpoint_id: 1,
    prompt_id: null,
    prompt_label: "production",
    cache_enabled: false,
    cache_ttl_seconds: 14400,
    is_active: false,
    created_by_name: null,
    created_at: "2025-02-01T00:00:00Z",
  },
];

const mockGuardrailRules = [
  { id: 1, is_active: true },
  { id: 2, is_active: false },
];

const mockProvidersData = {
  providers: ["openai", "anthropic"],
  models: {
    openai: [{ id: "gpt-4o", provider: "openai", mode: "chat" }],
    anthropic: [{ id: "claude-3", provider: "anthropic", mode: "chat" }],
  },
};

/** Route apiServices.get calls to the right fixture based on URL. */
function mockGetImplementation(overrides: {
  endpoints?: any[];
  apiKeys?: any[];
  guardrails?: any[];
} = {}) {
  return (url: string) => {
    if (url.includes("/ai-gateway/endpoints")) {
      return Promise.resolve({ data: { endpoints: overrides.endpoints ?? mockEndpoints } });
    }
    if (url.includes("/ai-gateway/keys")) {
      return Promise.resolve({ data: { data: overrides.apiKeys ?? mockApiKeys } });
    }
    if (url.includes("/ai-gateway/guardrails")) {
      return Promise.resolve({ data: { rules: overrides.guardrails ?? mockGuardrailRules } });
    }
    if (url.includes("/ai-gateway/providers")) {
      return Promise.resolve({ data: { data: mockProvidersData } });
    }
    return Promise.resolve({ data: {} });
  };
}

/**
 * The house `Select` component's visible combobox `div[role="combobox"]`
 * isn't associated with its label (the label targets a hidden native input
 * used only for form semantics), so it has no accessible name. Select by
 * DOM order instead — modal fields render Provider, Model, API key (in that
 * order) — then click the option by its visible text.
 */
function selectComboboxOption(index: number, optionName: string) {
  const combos = screen.getAllByRole("combobox");
  fireEvent.mouseDown(combos[index]);
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

describe("AIGateway - Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiServices.get as any).mockImplementation(mockGetImplementation());
    (apiServices.post as any).mockResolvedValue({ data: {} });
    (apiServices.patch as any).mockResolvedValue({ data: {} });
    (apiServices.delete as any).mockResolvedValue({ data: {} });
  });

  it("shows a loading skeleton while fetching data", () => {
    (apiServices.get as any).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<EndpointsPage />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("shows an error state and retries on button click", async () => {
    (apiServices.get as any).mockRejectedValue(new Error("network down"));
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load endpoints/)).toBeInTheDocument();
    });

    (apiServices.get as any).mockImplementation(mockGetImplementation());
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));

    await waitFor(() => {
      expect(screen.getByText("Production GPT-4o")).toBeInTheDocument();
    });
  });

  it("shows empty state with API-key warning and disables Add endpoint when there are no endpoints or keys", async () => {
    (apiServices.get as any).mockImplementation(
      mockGetImplementation({ endpoints: [], apiKeys: [] }),
    );
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No endpoints configured yet/)).toBeInTheDocument();
    });

    expect(screen.getByText("No API keys configured")).toBeInTheDocument();
    expect(screen.getByText("Step 1: Add an API key in Settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add endpoint" })).toBeDisabled();
  });

  it("shows empty state without the API-key warning when keys already exist", async () => {
    (apiServices.get as any).mockImplementation(mockGetImplementation({ endpoints: [] }));
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No endpoints configured yet/)).toBeInTheDocument();
    });

    expect(screen.queryByText("No API keys configured")).not.toBeInTheDocument();
    expect(screen.getByText("Route requests through a unified gateway")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add endpoint" })).not.toBeDisabled();
  });

  it("renders endpoint rows with provider, model, RPM, fallback, guardrail count, and cache info", async () => {
    const { container } = renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText("Production GPT-4o")).toBeInTheDocument();
    });

    expect(container.textContent).toContain("openai / openai/gpt-4o");
    expect(container.textContent).toContain("OpenAI Key");
    expect(container.textContent).toContain("60 RPM");
    expect(container.textContent).toContain("1 guardrail");
    expect(container.textContent).toContain("cached 2h");
    expect(container.textContent).toContain("Added by Jane Doe");

    // Second row: inactive, no created_by_name, has a fallback endpoint
    expect(screen.getByText("Fallback Claude")).toBeInTheDocument();
    expect(container.textContent).toContain("has fallback");
    expect(container.textContent).toContain("Added ");

    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();
  });

  it("opens the edit modal pre-filled when a row is clicked", async () => {
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText("Production GPT-4o")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Production GPT-4o"));

    await waitFor(() => {
      expect(screen.getByText("Edit endpoint")).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/^Endpoint name/)).toHaveValue("Production GPT-4o");
    expect(screen.getByText("production-gpt-4o")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("auto-generates a slug from the display name when creating an endpoint", async () => {
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add endpoint" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add endpoint" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add endpoint" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^Endpoint name/), {
      target: { value: "My New Endpoint!" },
    });

    expect(screen.getByText("my-new-endpoint")).toBeInTheDocument();
  });

  it("shows a validation error when required fields are missing on submit", async () => {
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add endpoint" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add endpoint" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Add endpoint" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));

    await waitFor(() => {
      expect(
        screen.getByText("Name, provider, model, and API key are required"),
      ).toBeInTheDocument();
    });
    expect(apiServices.post).not.toHaveBeenCalled();
  });

  it("creates an endpoint successfully and reloads the list", async () => {
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add endpoint" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add endpoint" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Add endpoint" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^Endpoint name/), {
      target: { value: "New Endpoint" },
    });

    // Provider, Model, API key selects (in DOM order)
    selectComboboxOption(0, "openai");
    selectComboboxOption(1, "gpt-4o");
    selectComboboxOption(2, "OpenAI Key (openai)");

    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));

    await waitFor(() => {
      expect(apiServices.post).toHaveBeenCalledWith(
        "/ai-gateway/endpoints",
        expect.objectContaining({
          display_name: "New Endpoint",
          provider: "openai",
          model: "openai/gpt-4o",
          api_key_id: 1,
          slug: "new-endpoint",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Add endpoint" })).not.toBeInTheDocument();
    });
    // Initial load + reload after create
    expect((apiServices.get as any).mock.calls.filter((c: any[]) => c[0].includes("/ai-gateway/endpoints")))
      .toHaveLength(2);
  });

  it("updates an existing endpoint via patch", async () => {
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText("Production GPT-4o")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Production GPT-4o"));
    await waitFor(() => expect(screen.getByText("Edit endpoint")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^Endpoint name/), {
      target: { value: "Production GPT-4o (renamed)" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(apiServices.patch).toHaveBeenCalledWith(
        "/ai-gateway/endpoints/1",
        expect.objectContaining({ display_name: "Production GPT-4o (renamed)" }),
      );
    });
  });

  it("shows the API error message when create submission fails", async () => {
    (apiServices.post as any).mockRejectedValue({
      response: { data: { detail: "Slug already exists" } },
    });
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add endpoint" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add endpoint" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Add endpoint" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^Endpoint name/), { target: { value: "New One" } });
    selectComboboxOption(0, "openai");
    selectComboboxOption(1, "gpt-4o");
    selectComboboxOption(2, "OpenAI Key (openai)");

    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));

    await waitFor(() => {
      expect(screen.getByText("Slug already exists")).toBeInTheDocument();
    });
  });

  it("toggles an endpoint's active state", async () => {
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText("Production GPT-4o")).toBeInTheDocument();
    });

    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(apiServices.patch).toHaveBeenCalledWith("/ai-gateway/endpoints/1", {
        is_active: false,
      });
    });
  });

  it("opens delete confirmation and deletes the endpoint on confirm", async () => {
    const { container } = renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByText("Production GPT-4o")).toBeInTheDocument();
    });

    const trashIcon = container.querySelectorAll("svg.lucide-trash-2")[0];
    fireEvent.click(trashIcon.closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("Delete endpoint")).toBeInTheDocument();
    });
    expect(screen.getByText(/Are you sure you want to delete "Production GPT-4o"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(apiServices.delete).toHaveBeenCalledWith("/ai-gateway/endpoints/1");
    });
  });

  it("reveals the cache TTL field when response caching is enabled", async () => {
    renderWithProviders(<EndpointsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add endpoint" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add endpoint" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Add endpoint" })).toBeInTheDocument());

    expect(screen.queryByLabelText(/^Cache TTL \(seconds\)/)).not.toBeInTheDocument();

    const cacheToggle = screen.getByRole("switch");
    fireEvent.click(cacheToggle);

    expect(screen.getByLabelText(/^Cache TTL \(seconds\)/)).toBeInTheDocument();
  });
});
