import { screen, fireEvent, within, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

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
  PageHeaderExtended: ({ children, title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import ModelsPage from "./index";

interface ModelInfo {
  id: string;
  provider: string;
  mode: string;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  input_cost_per_million: number;
  output_cost_per_million: number;
  supports_vision: boolean;
  supports_function_calling: boolean;
  supports_pdf_input: boolean;
  supports_prompt_caching: boolean;
  supports_response_schema: boolean;
  supports_system_messages: boolean;
  supports_tool_choice: boolean;
  supports_parallel_function_calling: boolean;
}

const baseModel = (overrides: Partial<ModelInfo> & { id: string; provider: string }): ModelInfo => ({
  mode: "chat",
  max_input_tokens: 128000,
  max_output_tokens: 4096,
  input_cost_per_million: 1,
  output_cost_per_million: 2,
  supports_vision: false,
  supports_function_calling: false,
  supports_pdf_input: false,
  supports_prompt_caching: false,
  supports_response_schema: false,
  supports_system_messages: false,
  supports_tool_choice: false,
  supports_parallel_function_calling: false,
  ...overrides,
});

// 9 clean models across 5 providers + 2 rows that should be filtered out
const richModels: ModelInfo[] = [
  baseModel({
    id: "gpt-4o",
    provider: "openai",
    input_cost_per_million: 2.5,
    output_cost_per_million: 10,
    supports_vision: true,
    supports_function_calling: true,
    supports_prompt_caching: true,
    supports_response_schema: true,
    supports_system_messages: true,
    supports_tool_choice: true,
    supports_parallel_function_calling: true,
  }),
  baseModel({
    id: "gpt-4o-mini",
    provider: "openai",
    input_cost_per_million: 0.15,
    output_cost_per_million: 0.6,
    supports_vision: true,
    supports_function_calling: true,
    supports_prompt_caching: true,
    supports_response_schema: true,
    supports_system_messages: true,
    supports_tool_choice: true,
    supports_parallel_function_calling: true,
  }),
  baseModel({
    id: "claude-sonnet-4-20250514",
    provider: "anthropic",
    max_input_tokens: 200000,
    max_output_tokens: 8192,
    input_cost_per_million: 3,
    output_cost_per_million: 15,
    supports_vision: true,
    supports_function_calling: true,
    supports_pdf_input: true,
    supports_prompt_caching: true,
    supports_system_messages: true,
    supports_tool_choice: true,
  }),
  baseModel({
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    input_cost_per_million: 0.8,
    output_cost_per_million: 4,
    supports_vision: true,
    supports_function_calling: true,
    supports_pdf_input: true,
    supports_prompt_caching: true,
    supports_response_schema: true,
    supports_system_messages: true,
    supports_tool_choice: true,
    supports_parallel_function_calling: true,
  }),
  baseModel({
    id: "gemini-2.0-flash",
    provider: "gemini",
    max_input_tokens: 1000000,
    input_cost_per_million: 0.1,
    output_cost_per_million: 0.4,
    supports_vision: true,
    supports_function_calling: true,
    supports_pdf_input: true,
    supports_response_schema: true,
    supports_system_messages: true,
  }),
  baseModel({
    id: "gemini-2.5-pro-preview-06-05",
    provider: "gemini",
    max_input_tokens: 1000000,
    input_cost_per_million: 1.25,
    output_cost_per_million: 5,
    supports_vision: true,
    supports_function_calling: true,
    supports_pdf_input: true,
    supports_prompt_caching: true,
    supports_response_schema: true,
    supports_system_messages: true,
    supports_tool_choice: true,
    supports_parallel_function_calling: true,
  }),
  baseModel({
    id: "mistral-large-latest",
    provider: "mistral",
    input_cost_per_million: 2,
    output_cost_per_million: 6,
    supports_function_calling: true,
    supports_system_messages: true,
    supports_tool_choice: true,
  }),
  baseModel({
    id: "grok-3",
    provider: "xai",
    input_cost_per_million: 3,
    output_cost_per_million: 15,
    supports_function_calling: true,
    supports_system_messages: true,
  }),
  baseModel({
    id: "text-embedding-3-small",
    provider: "openai",
    mode: "embedding",
    max_output_tokens: null,
    input_cost_per_million: 0.02,
    output_cost_per_million: 0,
  }),
  // Should be filtered out by cleanModels
  baseModel({ id: "sample_spec", provider: "sample" }),
  baseModel({ id: "legacy-model", provider: "docs.litellm.ai" }),
];

const renderModels = (route = "/ai-gateway/models/catalog") =>
  renderWithProviders(
    <Routes>
      <Route path="/ai-gateway/models/:tab" element={<ModelsPage />} />
    </Routes>,
    { route },
  );

const findCombobox = (index: number) => screen.getAllByRole("combobox")[index];

describe("AIGateway - ModelsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton while fetching the catalog", () => {
    (apiServices.get as any).mockImplementation(() => new Promise(() => {}));
    const { container } = renderModels();
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a retry button when loading fails", async () => {
    (apiServices.get as any).mockRejectedValue(new Error("network down"));
    renderModels();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load model catalog. Is the AI Gateway running?"),
      ).toBeInTheDocument();
    });

    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(apiServices.get).toHaveBeenCalledTimes(2);
    });
  });

  it("renders the populated catalog, filtering out sample/docs rows, with correct description", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels();

    await waitFor(() => {
      expect(screen.getByText("Browse 9 LLM models across 5 providers.")).toBeInTheDocument();
    });

    expect(screen.getByText("9 models")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("$2.50")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    // — for zero output cost on the embedding model
    expect(screen.queryByText("sample_spec")).not.toBeInTheDocument();
    expect(screen.queryByText("legacy-model")).not.toBeInTheDocument();
  });

  it("shows an empty state when the search matches nothing", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels();
    await screen.findByText("gpt-4o");

    fireEvent.change(screen.getByPlaceholderText("Search models..."), {
      target: { value: "nonexistent-model-xyz" },
    });

    expect(await screen.findByText("No models match your filters.")).toBeInTheDocument();
  });

  it("filters models by search text", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels();
    await screen.findByText("gpt-4o");

    fireEvent.change(screen.getByPlaceholderText("Search models..."), {
      target: { value: "claude" },
    });

    await waitFor(() => {
      expect(screen.getByText("2 models (filtered)")).toBeInTheDocument();
    });
    expect(screen.getByText("claude-sonnet-4-20250514")).toBeInTheDocument();
    expect(screen.getByText("claude-haiku-4-5-20251001")).toBeInTheDocument();
    expect(screen.queryByText("gpt-4o")).not.toBeInTheDocument();
  });

  it("filters models by provider dropdown", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels();
    await screen.findByText("gpt-4o");

    fireEvent.mouseDown(findCombobox(0)); // provider-filter
    fireEvent.click(screen.getByRole("option", { name: "mistral" }));

    await waitFor(() => {
      expect(screen.getByText("1 models (filtered)")).toBeInTheDocument();
    });
    expect(screen.getByText("mistral-large-latest")).toBeInTheDocument();
    expect(screen.queryByText("gpt-4o")).not.toBeInTheDocument();
  });

  it("filters models by mode dropdown", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels();
    await screen.findByText("gpt-4o");

    fireEvent.mouseDown(findCombobox(1)); // mode-filter
    fireEvent.click(screen.getByRole("option", { name: "Embedding" }));

    await waitFor(() => {
      expect(screen.getByText("1 models (filtered)")).toBeInTheDocument();
    });
    expect(screen.getByText("text-embedding-3-small")).toBeInTheDocument();
  });

  it("toggles the Vision feature filter chip", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels();
    await screen.findByText("gpt-4o");

    fireEvent.click(screen.getByText("Vision"));

    await waitFor(() => {
      expect(screen.getByText("6 models (filtered)")).toBeInTheDocument();
    });
    expect(screen.queryByText("mistral-large-latest")).not.toBeInTheDocument();
    expect(screen.queryByText("grok-3")).not.toBeInTheDocument();
  });

  it("paginates results when more than PAGE_SIZE models are returned", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      baseModel({ id: `model-${i}`, provider: "openai", input_cost_per_million: 1 + i }),
    );
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: many } } });
    renderModels();

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });

    const { container } = screen.getByText("Page 1 of 2").closest("div")!
      .parentElement as unknown as { container: HTMLElement };
    void container;

    const nextBtn = document
      .querySelector("svg.lucide-chevron-right")
      ?.closest("button") as HTMLElement;
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    });

    const prevBtn = document
      .querySelector("svg.lucide-chevron-left")
      ?.closest("button") as HTMLElement;
    expect(prevBtn).not.toBeDisabled();
  });

  it("navigates to the endpoints page when Add is clicked on a row", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels();
    await screen.findByText("gpt-4o");

    const addButtons = screen.getAllByRole("button", { name: "Add" });
    fireEvent.click(addButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      "/ai-gateway/endpoints?add=gpt-4o&provider=openai",
    );
  });

  it("renders the cost calculator tab with default inputs and estimated costs", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels("/ai-gateway/models/calculator");

    await waitFor(() => {
      // "Cost calculator" appears both as the tab label and the section title.
      expect(screen.getAllByText("Cost calculator").length).toBeGreaterThan(0);
    });

    expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Estimated costs \(1,000 req\/day\)/)).toBeInTheDocument();
    });
    expect(screen.getByText("cheapest")).toBeInTheDocument();
    // Embedding model should be excluded from cost calculator (mode !== chat)
    expect(screen.queryByText("text-embedding-3-small")).not.toBeInTheDocument();
  });

  it("recalculates costs when calculator inputs change", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels("/ai-gateway/models/calculator");
    await screen.findByText(/Estimated costs/);

    fireEvent.change(screen.getByDisplayValue("1000"), { target: { value: "5000" } });

    await waitFor(() => {
      expect(screen.getByText(/Estimated costs \(5,000 req\/day\)/)).toBeInTheDocument();
    });
  });

  it("shows a 'show all' toggle when calculator results exceed 50", async () => {
    const manyChat = Array.from({ length: 55 }, (_, i) =>
      baseModel({
        id: `chat-model-${i}`,
        provider: "openai",
        mode: "chat",
        input_cost_per_million: 1 + i,
        output_cost_per_million: 2 + i,
      }),
    );
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: manyChat } } });
    renderModels("/ai-gateway/models/calculator");

    await waitFor(() => {
      expect(screen.getByText("Show all 55 models")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Show all 55 models"));

    await waitFor(() => {
      expect(screen.getByText("Show top 50 of 55")).toBeInTheDocument();
    });
  });

  it("shows the feature comparison table pre-populated with default models", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels("/ai-gateway/models/compare");

    await waitFor(() => {
      // "Feature comparison" appears both as the tab label and the section title.
      expect(screen.getAllByText("Feature comparison").length).toBeGreaterThan(0);
    });

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4); // Feature + 3 default models
    expect(within(table).getByText("gpt-4o")).toBeInTheDocument();
    expect(within(table).getByText("claude-sonnet-4-20250514")).toBeInTheDocument();
    expect(within(table).getByText("gemini-2.0-flash")).toBeInTheDocument();
  });

  it("adds models to comparison via quick-select chips, capped at 5", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels("/ai-gateway/models/compare");
    await screen.findByRole("table");

    fireEvent.click(screen.getByText("mistral-large-latest"));
    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(5);
    });

    fireEvent.click(screen.getByText("gpt-4o-mini"));
    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(6);
    });

    // 6th selection should be blocked (max 5 compared models)
    fireEvent.click(screen.getByText("grok-3"));
    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(6);
    });
    expect(within(screen.getByRole("table")).queryByText("grok-3")).not.toBeInTheDocument();
  });

  it("removes a model from comparison via the trash icon in the table header", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels("/ai-gateway/models/compare");
    await screen.findByRole("table");

    const removeSpan = document
      .querySelector("svg.lucide-trash-2")
      ?.closest("span") as HTMLElement;
    expect(removeSpan).toBeTruthy();
    fireEvent.click(removeSpan);

    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(3);
    });
  });

  it("adds a model to comparison via the search box and clears the query", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels("/ai-gateway/models/compare");
    await screen.findByRole("table");

    fireEvent.change(screen.getByPlaceholderText("Or search for any model..."), {
      target: { value: "grok" },
    });

    // "grok-3" also appears as an always-present quick-select chip (a <div>);
    // the search-result row renders it in a <p>, so scope by tag to
    // disambiguate.
    const result = await screen.findByText("grok-3", { selector: "p" }, { timeout: 3000 });
    fireEvent.click(result);

    await waitFor(() => {
      expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(5);
    });
    expect(screen.queryByPlaceholderText("Or search for any model...")).toHaveValue("");
  });

  it("shows a placeholder message when no models are selected for comparison", async () => {
    (apiServices.get as any).mockResolvedValue({ data: { data: { models: richModels } } });
    renderModels("/ai-gateway/models/compare");
    await screen.findByRole("table");

    document.querySelectorAll("svg.lucide-trash-2").forEach((svg) => {
      const span = svg.closest("span");
      if (span) fireEvent.click(span);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Search and select models above to compare features side by side."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
