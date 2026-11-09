import { act, screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomException from "../../../../infrastructure/exceptions/customeException";

const mockNavigate = vi.fn();
let mockParams: { tab?: string } = {};

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
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
  PageHeaderExtended: ({ children, title, actionButton }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actionButton}
      {children}
    </div>
  ),
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import GuardrailsPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockPatch = apiServices.patch as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;

function makePiiRule(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    guardrail_type: "pii",
    name: "Block emails",
    action: "block",
    config: { entities: { EMAIL_ADDRESS: "block" } },
    is_active: true,
    ...overrides,
  };
}

function makeCfRule(overrides: Record<string, any> = {}) {
  return {
    id: 2,
    guardrail_type: "content_filter",
    name: "Block secret",
    action: "block",
    config: { type: "keyword", pattern: "secret" },
    is_active: true,
    ...overrides,
  };
}

describe("AIGateway - Guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
    mockGet.mockResolvedValue({ data: { rules: [] } });
    mockPost.mockResolvedValue({ data: {} });
    mockPatch.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<GuardrailsPage />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load guardrails. Please try again.")).toBeInTheDocument();
    });

    mockGet.mockResolvedValueOnce({ data: { rules: [makePiiRule()] } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Block emails")).toBeInTheDocument();
    });
  });

  it("shows a PII-empty state with tips when there are no PII rules", async () => {
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No PII detection rules configured/)).toBeInTheDocument();
    });
    expect(screen.getByText("In-process PII scanning")).toBeInTheDocument();
  });

  it("renders PII rule rows with entity summary and action chip", async () => {
    mockGet.mockResolvedValue({ data: { rules: [makePiiRule()] } });
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block emails")).toBeInTheDocument();
    });
    expect(screen.getByText("email address")).toBeInTheDocument();
    expect(screen.getByText("Block")).toBeInTheDocument();
  });

  it("navigates to the content-filter tab when TabBar is clicked", async () => {
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No PII detection rules configured/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Content filter/ }));

    expect(mockNavigate).toHaveBeenCalledWith("/ai-gateway/guardrails/content-filter", {
      replace: true,
    });
  });

  it("shows the content-filter tab content when the tab param is set", async () => {
    mockParams = { tab: "content-filter" };
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No content filter rules configured/)).toBeInTheDocument();
    });
  });

  it("creates a PII rule with the selected entity and action", async () => {
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No PII detection rules configured/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add PII rule" }));
    expect(screen.getByRole("heading", { name: "Add PII detection rule" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Rule name/), { target: { value: "Block SSNs" } });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]); // entity select
    fireEvent.click(screen.getByRole("option", { name: "US SSN" }));

    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/guardrails",
        expect.objectContaining({
          guardrail_type: "pii",
          name: "Block SSNs",
          config: expect.objectContaining({ entities: { US_SSN: "block" } }),
        }),
      );
    });
  });

  it("shows a masking warning when the PII action is set to mask", async () => {
    renderWithProviders(<GuardrailsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No PII detection rules configured/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add PII rule" }));

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[1]); // action select
    fireEvent.click(screen.getByRole("option", { name: "Mask" }));

    expect(
      screen.getByText(/Masking replaces personal data with placeholders/),
    ).toBeInTheDocument();
  });

  it("toggles a PII rule's active state", async () => {
    mockGet.mockResolvedValue({ data: { rules: [makePiiRule()] } });
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block emails")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/ai-gateway/guardrails/1", { is_active: false });
    });
  });

  it("deletes a rule after confirming in the delete modal", async () => {
    mockGet.mockResolvedValue({ data: { rules: [makePiiRule()] } });
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block emails")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button");
    const trashButton = deleteButtons.find((b) => b.querySelector("svg.lucide-trash-2"));
    fireEvent.click(trashButton!);

    expect(screen.getByRole("heading", { name: "Remove guardrail rule" })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to remove "Block emails"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove rule" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/guardrails/1");
    });
  });

  it("shows a content-filter-empty state and creates a keyword rule", async () => {
    mockParams = { tab: "content-filter" };
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No content filter rules configured/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add filter rule" }));
    fireEvent.change(screen.getByLabelText(/^Rule name/), { target: { value: "Block term" } });
    fireEvent.change(screen.getByLabelText(/^Keyword/), { target: { value: "confidential" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/guardrails",
        expect.objectContaining({
          guardrail_type: "content_filter",
          name: "Block term",
          config: { type: "keyword", pattern: "confidential" },
        }),
        { suppressGlobalErrorToast: true },
      );
    });
  });

  it("validates required name/pattern before creating a content filter rule", async () => {
    mockParams = { tab: "content-filter" };
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No content filter rules configured/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add filter rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    expect(screen.getByText("Name and pattern are required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows an invalid-regex error when the pattern doesn't compile", async () => {
    mockParams = { tab: "content-filter" };
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No content filter rules configured/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add filter rule" }));
    fireEvent.change(screen.getByLabelText(/^Rule name/), { target: { value: "Bad regex" } });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]); // match type select
    fireEvent.click(screen.getByRole("option", { name: "Regex pattern" }));

    fireEvent.change(screen.getByLabelText(/^Regex pattern/), {
      target: { value: "(unterminated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    expect(screen.getByText("Invalid regex pattern")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("renders content-filter rule rows with a described pattern", async () => {
    mockParams = { tab: "content-filter" };
    mockGet.mockResolvedValue({ data: { rules: [makeCfRule()] } });
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block secret")).toBeInTheDocument();
    });
    expect(screen.getByText('Keyword: "secret"')).toBeInTheDocument();
  });

  it("runs the guardrail test and shows detection results", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          would_block: true,
          detections: [
            { entity_type: "EMAIL_ADDRESS", matched_text: "j@example.com", action: "block" },
          ],
          execution_time_ms: 4,
        },
      },
    });
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), {
      target: { value: "email me at j@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/guardrails/test",
        { text: "email me at j@example.com" },
        { suppressGlobalErrorToast: true },
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Would be blocked")).toBeInTheDocument();
    });
    expect(screen.getByText(/EMAIL_ADDRESS.*j@example.com.*block/)).toBeInTheDocument();
  });

  it("shows an error message when the guardrail test request fails", async () => {
    mockPost.mockRejectedValue(
      new CustomException("Request failed", 400, { detail: "Service unavailable" }),
    );
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => {
      expect(screen.getByText("Service unavailable")).toBeInTheDocument();
    });
  });

  it("hides the gateway's internal-key rejection behind the friendly error", async () => {
    mockPost.mockRejectedValue(
      new CustomException("Request failed", 401, {
        detail: { message: "Invalid internal key", code: "INVALID_KEY" },
      }),
    );
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => {
      expect(
        screen.getByText("Test failed — is the AI Gateway service running?"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Invalid internal key")).not.toBeInTheDocument();
  });

  it("shows the friendly error, not the proxy's socket error, when the gateway is down", async () => {
    mockPost.mockRejectedValue(
      new CustomException("connect ECONNREFUSED 127.0.0.1:8100", 502, {
        error: "AI Gateway proxy error",
        message: "connect ECONNREFUSED 127.0.0.1:8100",
      }),
    );
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => {
      expect(
        screen.getByText("Test failed — is the AI Gateway service running?"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });

  it("does not send sample text over the gateway's length limit", async () => {
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), {
      target: { value: "a".repeat(20_001) },
    });

    expect(screen.getByText("Sample text must be at most 20,000 characters")).toBeInTheDocument();
    const run = screen.getByRole("button", { name: "Run test" });
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("keeps Run test disabled until there is sample text", async () => {
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    expect(screen.getByRole("button", { name: "Run test" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Run test" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "hi" } });
    expect(screen.getByRole("button", { name: "Run test" })).not.toBeDisabled();
  });

  it("counts an emoji as one character, as the gateway does", async () => {
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    // 12,000 emoji: 24,000 UTF-16 units but 12,000 characters.
    fireEvent.change(screen.getByLabelText(/^Sample text/), {
      target: { value: "\u{1F600}".repeat(12_000) },
    });

    expect(screen.queryByText(/must be at most/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run test" })).not.toBeDisabled();
  });

  it("drops a response that arrives after the sample text changed", async () => {
    let answer: (v: unknown) => void = () => {};
    mockPost.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "card 4111" } });
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "hello" } });

    // The scan is still running on the gateway, so no second one can start.
    expect(screen.getByRole("button", { name: "Scanning..." })).toBeDisabled();

    await act(async () => {
      answer({ data: { data: { would_block: true, detections: [], execution_time_ms: 9 } } });
    });
    expect(screen.queryByText("Would be blocked")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run test" })).not.toBeDisabled();
  });

  it("clears a result when the sample text changes", async () => {
    mockPost.mockResolvedValue({
      data: { data: { would_block: false, detections: [], execution_time_ms: 3 } },
    });
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Test guardrails" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test guardrails" }));
    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Run test" }));
    await waitFor(() => {
      expect(screen.getByText("3ms")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^Sample text/), { target: { value: "hello again" } });
    expect(screen.queryByText("3ms")).not.toBeInTheDocument();
  });

  it("opens the catalog modal, filters by search, and enables an item", async () => {
    renderWithProviders(<GuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add from catalog" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add from catalog" }));
    expect(screen.getByRole("heading", { name: "Guardrail catalog" })).toBeInTheDocument();
    expect(screen.getByText("Email addresses")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search guardrails..."), {
      target: { value: "credit card" },
    });

    // "Credit card numbers" also appears as a "detects" example badge under
    // the unrelated "PCI DSS cardholder data" item, which also matches the
    // "credit card" search term via its description.
    expect(screen.getAllByText("Credit card numbers").length).toBeGreaterThan(0);
    expect(screen.queryByText("Phone numbers")).not.toBeInTheDocument();

    const enableButtons = screen.getAllByRole("button", { name: "Enable" });
    fireEvent.click(enableButtons[0]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/guardrails",
        expect.objectContaining({ name: "Credit card numbers", guardrail_type: "pii" }),
      );
    });
  });

  it("collapses and expands a catalog category", async () => {
    renderWithProviders(<GuardrailsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add from catalog" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add from catalog" }));

    expect(screen.getByText("Email addresses")).toBeInTheDocument();
    // "PII detection" also labels the page's tab (still in the DOM, just
    // hidden behind the modal) — the category header is the non-tab match.
    const categoryHeader = screen
      .getAllByText("PII detection")
      .find((el) => el.closest('[role="tab"]') === null)!;

    // MUI's Collapse keeps its children mounted and just animates height
    // rather than unmounting, so this only exercises the toggleCategory
    // code path (expand/collapse state) without asserting DOM removal.
    fireEvent.click(categoryHeader);
    fireEvent.click(categoryHeader);
    expect(screen.getByRole("heading", { name: "Guardrail catalog" })).toBeInTheDocument();
  });

  it("shows already-enabled catalog items as Enabled instead of a button", async () => {
    mockGet.mockResolvedValue({
      data: { rules: [makePiiRule({ name: "Email addresses" })] },
    });
    renderWithProviders(<GuardrailsPage />);
    await waitFor(() => {
      expect(screen.getByText("Email addresses")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add from catalog" }));

    const enabledLabels = screen.getAllByText("Enabled");
    expect(enabledLabels.length).toBeGreaterThan(0);
  });
});
