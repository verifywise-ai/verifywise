import { render, screen, fireEvent } from "@testing-library/react";
import { SuggestedRisksSection } from "../SuggestedRisksSection";
import type { SuggestedRisk } from "../../../../../domain/ai-detection/riskScoringTypes";

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));

vi.mock("../../../../components/AddNewRiskForm", () => ({
  __esModule: true,
  default: ({ onSuccess, onError }: { onSuccess: () => void; onError: (m: string) => void }) => (
    <div data-testid="add-new-risk-form">
      <button onClick={onSuccess}>Simulate success</button>
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

describe("SuggestedRisksSection", () => {
  it("renders nothing when there are no suggestions", () => {
    const { container } = render(
      <SuggestedRisksSection suggestions={[]} onSuccess={vi.fn()} onError={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the collapsed 'Suggested risks' header", () => {
    render(
      <SuggestedRisksSection
        suggestions={[makeSuggestion()]}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByText("Suggested risks")).toBeInTheDocument();
    expect(screen.queryByText("Sensitive data exposure")).not.toBeVisible();
  });

  it("expands to show suggestion details on click", () => {
    render(
      <SuggestedRisksSection
        suggestions={[makeSuggestion()]}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Suggested risks"));

    expect(screen.getByText("Sensitive data exposure")).toBeVisible();
    expect(
      screen.getByText("User data may be sent to a third-party LLM provider without redaction."),
    ).toBeVisible();
    expect(screen.getByText("Data sovereignty")).toBeInTheDocument();
    expect(screen.getByText("Cybersecurity risk")).toBeInTheDocument();
  });

  it("opens the add-to-risk-register modal when clicked", () => {
    render(
      <SuggestedRisksSection
        suggestions={[makeSuggestion()]}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(screen.getByText("Add to risk register"));

    expect(screen.getByText("Add suggested risk to register")).toBeInTheDocument();
    expect(screen.getByTestId("add-new-risk-form")).toBeInTheDocument();
  });

  it("calls onSuccess and removes the suggestion after a successful submit", async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();

    render(
      <SuggestedRisksSection
        suggestions={[makeSuggestion()]}
        onSuccess={onSuccess}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(screen.getByText("Add to risk register"));
    fireEvent.click(screen.getByText("Simulate success"));

    expect(onSuccess).toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    vi.useRealTimers();
  });

  it("opens the ignore menu and dismisses the suggestion", () => {
    vi.useFakeTimers();

    render(
      <SuggestedRisksSection
        suggestions={[makeSuggestion()]}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(screen.getByText("Ignore"));

    const option = screen.getByText("This is not a real risk");
    fireEvent.click(option);

    vi.advanceTimersByTime(400);
    vi.useRealTimers();
  });

  it("calls onError when the risk form reports an error", () => {
    const onError = vi.fn();
    render(
      <SuggestedRisksSection
        suggestions={[makeSuggestion()]}
        onSuccess={vi.fn()}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByText("Suggested risks"));
    fireEvent.click(screen.getByText("Add to risk register"));
    fireEvent.click(screen.getByText("Simulate error"));

    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("renders multiple suggestions independently", () => {
    render(
      <SuggestedRisksSection
        suggestions={[
          makeSuggestion({ risk_name: "Risk one" }),
          makeSuggestion({ risk_name: "Risk two" }),
        ]}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Suggested risks"));

    expect(screen.getByText("Risk one")).toBeInTheDocument();
    expect(screen.getByText("Risk two")).toBeInTheDocument();
  });
});
