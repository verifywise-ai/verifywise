import { render, screen, fireEvent, act } from "@testing-library/react";
import { AiRiskSuggestions } from "../AiRiskSuggestions";
import type { SuggestRisksResponse } from "../../../../../../domain/types/riskSuggestion.types";

const mockAuth = { userRoleName: "Admin" };
vi.mock("../../../../../../application/hooks/useAuth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams("projectId=42")],
  };
});

vi.mock("../../../../../../application/repository/projectRisk.repository", () => ({
  suggestRisksWithAI: vi.fn(),
}));
import { suggestRisksWithAI } from "../../../../../../application/repository/projectRisk.repository";
const mockSuggest = vi.mocked(suggestRisksWithAI);

let capturedRiskFormProps: Record<string, any> | null = null;
vi.mock("../../../../../components/AddNewRiskForm", () => ({
  __esModule: true,
  default: (props: Record<string, any>) => {
    capturedRiskFormProps = props;
    return (
      <div data-testid="add-new-risk-form">
        <button onClick={props.onSuccess}>Simulate success</button>
        <button onClick={() => props.onError("boom")}>Simulate error</button>
      </div>
    );
  },
}));

const suggestResponse: SuggestRisksResponse = {
  matched: [
    {
      source: "mit",
      id: 125,
      summary: "Unauthorized access to model inference endpoints",
      description: "Attackers may gain unauthorized access to exposed inference endpoints.",
      risk_category: ["Cybersecurity risk"],
      likelihood: "Almost certain",
      severity: "Major",
      reason: "The use case exposes LLM endpoints without describing access controls.",
      ai_lifecycle_phase: "Deployment & integration",
    },
  ],
  suggested: [
    {
      risk_name: "Vendor model deprecation mid-contract",
      risk_description: "The provider may deprecate the model version before the contract ends.",
      risk_category: ["Third-party/vendor risk"],
      ai_lifecycle_phase: "Monitoring & maintenance",
      likelihood: 3,
      severity: 4,
      impact: "Forced migration effort and potential service degradation.",
      mitigation_plan: "Pin model versions and abstract the provider API.",
    },
  ],
  suppressed_count: 0,
};

async function loadSuggestions() {
  fireEvent.click(screen.getByText("Suggest risks with AI"));
  await screen.findByText("Unauthorized access to model inference endpoints");
}

describe("AiRiskSuggestions", () => {
  beforeEach(() => {
    mockAuth.userRoleName = "Admin";
    mockSuggest.mockReset();
    mockSuggest.mockResolvedValue(suggestResponse);
    capturedRiskFormProps = null;
  });

  it("renders nothing for roles that cannot create risks", () => {
    mockAuth.userRoleName = "Auditor";
    const { container } = render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not fetch on mount and calls the endpoint with the URL projectId on click", async () => {
    render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);
    expect(mockSuggest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Suggest risks with AI"));

    expect(mockSuggest).toHaveBeenCalledWith({ body: { projectId: 42 } });
    await screen.findByText("Suggested risks");
  });

  it("renders matched catalog entries with source chip and reason, and freeform cards", async () => {
    render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);
    await loadSuggestions();

    expect(screen.getByText("MIT AI Risk Repository")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Why this matches: The use case exposes LLM endpoints without describing access controls.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Cybersecurity risk")).toBeInTheDocument();

    expect(screen.getByText("Vendor model deprecation mid-contract")).toBeInTheDocument();
    expect(
      screen.getByText("Impact: Forced migration effort and potential service degradation."),
    ).toBeInTheDocument();
    expect(screen.getByText("Third-party/vendor risk")).toBeInTheDocument();
  });

  it("removes a card when Ignore is clicked", async () => {
    render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);
    await loadSuggestions();

    vi.useFakeTimers();
    fireEvent.click(screen.getAllByText("Ignore")[1]);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();

    expect(screen.queryByText("Vendor model deprecation mid-contract")).not.toBeInTheDocument();
    expect(
      screen.getByText("Unauthorized access to model inference endpoints"),
    ).toBeInTheDocument();
  });

  it("prefills the risk form from a matched catalog entry", async () => {
    render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);
    await loadSuggestions();

    fireEvent.click(screen.getAllByText("Add to risk register")[0]);

    expect(screen.getByTestId("add-new-risk-form")).toBeInTheDocument();
    expect(capturedRiskFormProps?.initialRiskValues).toMatchObject({
      riskName: "Unauthorized access to model inference endpoints",
      riskDescription: "Attackers may gain unauthorized access to exposed inference endpoints.",
      riskCategory: [5],
      likelihood: 5, // MIT "Almost certain" → Likelihood.AlmostCertain
      riskSeverity: 4, // "Major" → Severity.Major
      aiLifecyclePhase: 5, // "Deployment & integration"
    });
    expect(capturedRiskFormProps?.initialRiskValues.reviewNotes).toContain(
      "MIT AI Risk Repository",
    );
    expect(capturedRiskFormProps?.initialRiskValues.reviewNotes).toContain(
      "The use case exposes LLM endpoints without describing access controls.",
    );
    expect(capturedRiskFormProps?.initialMitigationValues).toMatchObject({
      mitigationStatus: 1,
      mitigationPlan: "",
      likelihood: 5,
      riskSeverity: 4,
    });
  });

  it("prefills the risk and mitigation forms from a freeform suggestion", async () => {
    render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);
    await loadSuggestions();

    fireEvent.click(screen.getAllByText("Add to risk register")[1]);

    expect(capturedRiskFormProps?.initialRiskValues).toMatchObject({
      riskName: "Vendor model deprecation mid-contract",
      riskCategory: [9],
      likelihood: 3,
      riskSeverity: 4,
      aiLifecyclePhase: 6,
      potentialImpact: "Forced migration effort and potential service degradation.",
      reviewNotes: "Suggested by AI based on the use case description.",
    });
    expect(capturedRiskFormProps?.initialMitigationValues).toMatchObject({
      mitigationStatus: 1,
      mitigationPlan: "Pin model versions and abstract the provider API.",
      likelihood: 3,
      riskSeverity: 4,
    });
  });

  it("removes the card, fires onRiskSaved, and shows a success alert after saving", async () => {
    const onRiskSaved = vi.fn();
    render(<AiRiskSuggestions onRiskSaved={onRiskSaved} />);
    await loadSuggestions();

    fireEvent.click(screen.getAllByText("Add to risk register")[0]);
    vi.useFakeTimers();
    fireEvent.click(screen.getByText("Simulate success"));

    expect(onRiskSaved).toHaveBeenCalled();
    expect(screen.getByText("Risk added to risk register")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();

    expect(
      screen.queryByText("Unauthorized access to model inference endpoints"),
    ).not.toBeInTheDocument();
  });

  it("shows an error alert with the server message and no panel when the request fails", async () => {
    mockSuggest.mockRejectedValue(new Error("No LLM keys configured for this organization"));
    render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);

    fireEvent.click(screen.getByText("Suggest risks with AI"));

    expect(
      await screen.findByText("No LLM keys configured for this organization"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Suggested risks")).not.toBeInTheDocument();
  });

  it("shows an info alert and no panel when there is nothing to suggest", async () => {
    mockSuggest.mockResolvedValue({ matched: [], suggested: [], suppressed_count: 2 });
    render(<AiRiskSuggestions onRiskSaved={vi.fn()} />);

    fireEvent.click(screen.getByText("Suggest risks with AI"));

    expect(
      await screen.findByText(
        "No new risks to suggest — the matching risks are already in your risk register.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Suggested risks")).not.toBeInTheDocument();
  });
});
