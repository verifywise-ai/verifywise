import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";
import {
  approveSubmission,
  getSubmissionPreview,
} from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  retrySubmissionAssessment: vi.fn(),
  updateSuggestedRisk: vi.fn(),
  acceptAllSuggestedRisks: vi.fn(),
}));

const assessment = {
  version: 2,
  status: "complete",
  notRuleChecked: false,
  classificationLevel: "High risk",
  ruleMinimum: 70,
  ai: {
    runs: [60, 64, 70],
    failedRuns: 2,
    validRuns: 3,
    median: 64,
    min: 60,
    max: 70,
    reasons: [],
  },
  finalScore: 70,
  source: "rule_minimum",
  rulesOnly: false,
  overallScore: 70,
  tier: "High",
  stageStartedAt: "2026-10-21T10:00:00.000Z",
  scoredAt: "2026-10-21T10:01:00.000Z",
};

function mockPreview(level: string, extra: Record<string, unknown> = {}) {
  vi.mocked(getSubmissionPreview).mockResolvedValue({
    data: {
      submission: { status: "pending" },
      riskAssessment: assessment,
      assessment,
      suggestedRisks: {
        status: "complete",
        items: [],
        droppedCount: 0,
        stageStartedAt: "x",
        generatedAt: "y",
      },
      assessedLevel: "High risk",
      ruleMinimumPreview: 70,
      entityPreview: { project_title: "Hiring tool" },
      form: {
        id: 1,
        name: "Intake",
        entityType: "use_case",
        schema: { version: "1.0", fields: [] },
      },
      euAiActClassification: {
        questionnaire: { version: 1, questions: [] },
        answers: {},
        role: null,
        current: { questionnaireVersion: 1, level, role: null, reasons: [], obligations: [] },
        changedSinceSubmission: false,
        submittedAt: "2026-10-01T00:00:00.000Z",
      },
      ...extra,
    },
  } as never);
}

async function openBands() {
  renderWithProviders(
    <SubmissionPreviewModal isOpen onClose={vi.fn()} submissionId={5} onApproved={vi.fn()} />,
  );
  fireEvent.click(await screen.findByText("Override intake risk score"));
  await screen.findByText("Override band");
  // The override select is the first combobox; the EU AI Act level is the second.
  fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
  const listbox = screen.getByRole("listbox");
  const disabled = (band: string) =>
    within(listbox).getByText(band).closest("li")!.getAttribute("aria-disabled") === "true";
  return { listbox, disabled };
}

describe("override band floor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a High risk minimum disables Low and Medium", async () => {
    mockPreview("High risk");
    const { disabled } = await openBands();
    expect(screen.getByText("Override band")).toBeInTheDocument();
    expect(disabled("Low")).toBe(true);
    expect(disabled("Medium")).toBe(true);
    expect(disabled("High")).toBe(false);
    expect(disabled("Critical")).toBe(false);
    expect(screen.getByText("Can't be lower than the rule minimum allows")).toBeInTheDocument();
  });

  it("a Prohibited minimum disables all but Critical, and approve sends Critical", async () => {
    mockPreview("Prohibited");
    vi.mocked(approveSubmission).mockResolvedValue({ data: {} } as never);
    const { disabled } = await openBands();
    expect(["Low", "Medium", "High"].map(disabled)).toEqual([true, true, true]);
    expect(disabled("Critical")).toBe(false);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    fireEvent.change(document.getElementById("override-justification")!, {
      target: { value: "Worse than the score shows" },
    });
    fireEvent.click(screen.getByText("Approve and create use case"));
    await waitFor(() => expect(approveSubmission).toHaveBeenCalled());
    const payload = vi.mocked(approveSubmission).mock.calls[0][1]!;
    expect(payload.riskOverride?.tier).toBe("Critical");
  });

  it("a Minimal risk minimum allows every band", async () => {
    mockPreview("Minimal risk");
    const { disabled } = await openBands();
    expect(["Low", "Medium", "High", "Critical"].map(disabled)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(screen.queryByText("Can't be lower than the rule minimum allows")).toBeNull();
  });

  it("opens a saved override pre-filled, raised to the lowest allowed band", async () => {
    mockPreview("High risk", {
      riskOverride: { tier: "Medium", justification: "Saved earlier", overriddenBy: 1 },
    });
    renderWithProviders(
      <SubmissionPreviewModal isOpen onClose={vi.fn()} submissionId={5} onApproved={vi.fn()} />,
    );
    expect(await screen.findByText("Override band")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("High");
    expect(document.getElementById("override-justification")).toHaveValue("Saved earlier");
  });

  it("says no score was recorded for a decided submission that never got one", async () => {
    vi.mocked(getSubmissionPreview).mockResolvedValue({
      data: {
        submission: { status: "approved" },
        riskAssessment: null,
        assessment: null,
        suggestedRisks: null,
        entityPreview: {},
        form: {
          id: 1,
          name: "Intake",
          entityType: "use_case",
          schema: { version: "1.0", fields: [] },
        },
        euAiActClassification: null,
      },
    } as never);
    renderWithProviders(
      <SubmissionPreviewModal isOpen onClose={vi.fn()} submissionId={5} onApproved={vi.fn()} />,
    );
    expect(
      await screen.findByText("No risk score was recorded for this submission."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Scoring…")).toBeNull();
  });
});
