import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SuggestedRisksSection } from "../SuggestedRisksSection";
import type { SuggestedRisk } from "../../../../../domain/ai-detection/riskScoringTypes";
import type { SuggestedRiskAction } from "../../../../../domain/ai-detection/types";
import type { RiskFormValues } from "../../../../../domain/types/riskForm.types";

const mockNavigate = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => mockNavigate }));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));

const mockGetActions = vi.fn();
const mockRecordAction = vi.fn();
const mockRestore = vi.fn();
vi.mock("../../../../../application/repository/aiDetection.repository", () => ({
  getSuggestedRiskActions: (...args: unknown[]) => mockGetActions(...args),
  recordSuggestedRiskAction: (...args: unknown[]) => mockRecordAction(...args),
  restoreSuggestedRisk: (...args: unknown[]) => mockRestore(...args),
}));

vi.mock("../../../../components/AddNewRiskForm", () => ({
  __esModule: true,
  default: ({
    onSuccess,
    onError,
    initialRiskValues,
  }: {
    onSuccess: (id?: number) => void;
    onError: (m: string) => void;
    initialRiskValues?: RiskFormValues;
  }) => (
    <div data-testid="add-new-risk-form">
      <span data-testid="review-notes">{initialRiskValues?.reviewNotes}</span>
      <button onClick={() => onSuccess(42)}>Simulate success</button>
      <button onClick={() => onError("boom")}>Simulate error</button>
    </div>
  ),
}));

function makeSuggestion(overrides: Partial<SuggestedRisk> = {}): SuggestedRisk {
  return {
    risk_name: "Sensitive data exposure",
    risk_description: "User data may be sent to a third-party LLM provider without redaction.",
    risk_category: ["Cybersecurity risk"],
    ai_lifecycle_phase: "Deployment & integration",
    likelihood: 4,
    severity: 4,
    impact: "High",
    mitigation_plan: "Add redaction middleware.",
    dimension: "data_sovereignty",
    finding_refs: ["finding-1"],
    ...overrides,
  };
}

function makeAction(overrides: Partial<SuggestedRiskAction> = {}): SuggestedRiskAction {
  return {
    id: 1,
    scan_id: 7,
    suggestion_key: "sensitive data exposure",
    risk_name: "Sensitive data exposure",
    action: "added",
    risk_id: 42,
    ignore_reason: null,
    acted_by: 1,
    acted_by_name: "Ada Lovelace",
    acted_at: "2026-11-03T10:00:00.000Z",
    risk_deleted: false,
    ...overrides,
  };
}

function renderSection(
  suggestions: SuggestedRisk[] = [makeSuggestion()],
  handlers: { onSuccess?: () => void; onError?: (m: string) => void } = {},
) {
  return render(
    <SuggestedRisksSection
      scanId={7}
      repositoryOwner="acme"
      repositoryName="app"
      suggestions={suggestions}
      onSuccess={handlers.onSuccess ?? vi.fn()}
      onError={handlers.onError ?? vi.fn()}
    />,
  );
}

describe("SuggestedRisksSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActions.mockResolvedValue([]);
    mockRecordAction.mockResolvedValue([]);
    mockRestore.mockResolvedValue([]);
  });

  it("renders nothing when there are no suggestions", () => {
    const { container } = renderSection([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("loads the saved actions for the scan and expands to show details", async () => {
    renderSection();
    await waitFor(() => expect(mockGetActions).toHaveBeenCalledWith(7, expect.anything()));

    expect(screen.getByText("Suggested risks")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive data exposure")).not.toBeVisible();

    fireEvent.click(screen.getByText("Suggested risks"));
    expect(screen.getByText("Sensitive data exposure")).toBeVisible();
    expect(screen.getByText("Data sovereignty")).toBeInTheDocument();
    expect(screen.getByText("Cybersecurity risk")).toBeInTheDocument();
  });

  it("summarises added and ignored suggestions and shows them on request", async () => {
    mockGetActions.mockResolvedValue([
      makeAction(),
      makeAction({
        id: 2,
        suggestion_key: "prompt injection",
        risk_name: "Prompt injection",
        action: "ignored",
        risk_id: null,
        ignore_reason: "not_real_risk",
      }),
    ]);
    renderSection([
      makeSuggestion(),
      makeSuggestion({ risk_name: "Prompt injection" }),
      makeSuggestion({ risk_name: "Model drift" }),
    ]);
    fireEvent.click(screen.getByText("Suggested risks"));

    expect(await screen.findByText("1 added to the risk register, 1 ignored")).toBeInTheDocument();
    expect(screen.getByText("Model drift")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive data exposure")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt injection")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Show added"));
    expect(screen.getByText("Sensitive data exposure")).toBeInTheDocument();
    expect(screen.getByText("Added to risk register")).toBeInTheDocument();
    fireEvent.click(screen.getByText("View risk"));
    expect(mockNavigate).toHaveBeenCalledWith("/risk-management?riskId=42");

    fireEvent.click(screen.getByText("Show ignored"));
    expect(screen.getByText("Prompt injection")).toBeInTheDocument();
    expect(screen.getByText("Ignored: This is not a real risk")).toBeInTheDocument();
  });

  it("offers a suggestion again when the risk created from it was deleted", async () => {
    mockGetActions.mockResolvedValue([makeAction({ risk_id: null, risk_deleted: true })]);
    renderSection();
    fireEvent.click(screen.getByText("Suggested risks"));
    await waitFor(() => expect(mockGetActions).toHaveBeenCalled());
    expect(await screen.findByText("Add to risk register")).toBeInTheDocument();
  });

  it("adds a suggestion, links the new risk and references the scan in the review notes", async () => {
    const onSuccess = vi.fn();
    mockRecordAction.mockResolvedValue([makeAction()]);
    renderSection([makeSuggestion()], { onSuccess });
    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(screen.getByText("Add to risk register"));

    expect(await screen.findByTestId("add-new-risk-form")).toBeInTheDocument();
    expect(screen.getByTestId("review-notes").textContent).toContain(
      "AI Detection scan #7 (acme/app)",
    );

    fireEvent.click(screen.getByText("Simulate success"));
    expect(onSuccess).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockRecordAction).toHaveBeenCalledWith(7, {
        risk_name: "Sensitive data exposure",
        action: "added",
        risk_id: 42,
      }),
    );
    expect(await screen.findByText("1 added to the risk register, 0 ignored")).toBeInTheDocument();
  });

  it("refuses to add a suggestion that was added elsewhere since the page loaded", async () => {
    const onError = vi.fn();
    renderSection([makeSuggestion()], { onError });
    fireEvent.click(screen.getByText("Suggested risks"));
    await waitFor(() => expect(mockGetActions).toHaveBeenCalledTimes(1));

    mockGetActions.mockResolvedValue([makeAction()]);
    fireEvent.click(screen.getByText("Add to risk register"));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("This suggestion is already in the risk register"),
    );
    expect(screen.queryByTestId("add-new-risk-form")).not.toBeInTheDocument();
  });

  it("saves the ignore reason", async () => {
    renderSection();
    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(screen.getByText("Ignore"));
    fireEvent.click(screen.getByText("This is not a real risk"));

    await waitFor(() =>
      expect(mockRecordAction).toHaveBeenCalledWith(7, {
        risk_name: "Sensitive data exposure",
        action: "ignored",
        reason: "not_real_risk",
      }),
    );
  });

  it("restores an ignored suggestion", async () => {
    mockGetActions.mockResolvedValue([
      makeAction({ id: 5, action: "ignored", risk_id: null, ignore_reason: "already_added" }),
    ]);
    renderSection();
    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(await screen.findByText("Show ignored"));
    fireEvent.click(screen.getByText("Restore"));

    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith(7, 5));
    expect(await screen.findByText("Add to risk register")).toBeInTheDocument();
  });

  it("calls onError when the risk form reports an error", async () => {
    const onError = vi.fn();
    renderSection([makeSuggestion()], { onError });
    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(screen.getByText("Add to risk register"));
    fireEvent.click(await screen.findByText("Simulate error"));

    expect(onError).toHaveBeenCalledWith("boom");
  });
});
