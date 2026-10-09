import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";
import CustomException from "../../../../infrastructure/exceptions/customeException";
import {
  getSubmissionPreview,
  approveSubmission,
} from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
}));

const euAiActClassification = {
  questionnaire: {
    version: 1,
    questions: [
      {
        id: "q1",
        text: "Which area does the system operate in?",
        articleRef: "Annex III",
        inputType: "single_select",
        options: [{ value: "hr", label: "Employment and HR" }],
      },
    ],
  },
  answers: { q1: "hr" },
  role: "Provider",
  current: {
    questionnaireVersion: 1,
    level: "High risk",
    role: "Provider",
    reasons: [{ article: "Annex III(4)", text: "Employment systems are high risk." }],
    obligations: [],
  },
  changedSinceSubmission: false,
  submittedAt: "2026-10-01T00:00:00.000Z",
};

function mockPreview(withClassification = true) {
  vi.mocked(getSubmissionPreview).mockResolvedValue({
    data: {
      submission: { status: "pending" },
      riskAssessment: null,
      entityPreview: { project_title: "Hiring tool", ai_risk_classification: "Minimal risk" },
      form: {
        id: 1,
        name: "Intake",
        entityType: "use_case",
        schema: {
          version: "1.0",
          fields: [
            { id: "f1", label: "Title", type: "text", entityFieldMapping: "project_title" },
            {
              id: "f2",
              label: "Risk class field",
              type: "text",
              entityFieldMapping: "ai_risk_classification",
            },
            {
              id: "f3",
              label: "Role field",
              type: "text",
              entityFieldMapping: "type_of_high_risk_role",
            },
          ],
        },
      },
      euAiActClassification: withClassification ? euAiActClassification : null,
    },
  } as never);
}

function renderModal() {
  return renderWithProviders(
    <SubmissionPreviewModal isOpen onClose={vi.fn()} submissionId={5} onApproved={vi.fn()} />,
  );
}

function chooseLevel(label: string) {
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(within(screen.getByRole("listbox")).getByText(label));
}

function clickApprove() {
  fireEvent.click(screen.getByText("Approve and create use case"));
}

describe("SubmissionPreviewModal EU AI Act risk step", () => {
  beforeEach(() => {
    vi.mocked(approveSubmission).mockReset();
    vi.mocked(approveSubmission).mockResolvedValue({ data: {} } as never);
  });

  it("renders the panel, relabels the intake risk section and hides overwritten fields", async () => {
    mockPreview();
    renderModal();
    expect(await screen.findByText("EU AI Act classification")).toBeInTheDocument();
    expect(screen.getByText("Intake risk score")).toBeInTheDocument();
    expect(screen.getByText("Override intake risk score")).toBeInTheDocument();
    expect(document.getElementById("entity-f1")).not.toBeNull();
    expect(document.getElementById("entity-f2")).toBeNull();
    expect(document.getElementById("entity-f3")).toBeNull();
  });

  it("shows no panel and keeps mapped fields when the preview key is null", async () => {
    mockPreview(false);
    renderModal();
    expect(await screen.findByText("Intake risk score")).toBeInTheDocument();
    expect(screen.queryByText("EU AI Act classification")).toBeNull();
    expect(document.getElementById("entity-f2")).not.toBeNull();
    expect(document.getElementById("entity-f3")).not.toBeNull();
  });

  it("blocks approval of a changed level without a justification", async () => {
    mockPreview();
    renderModal();
    await screen.findByText("EU AI Act classification");
    chooseLevel("Limited risk");
    fireEvent.change(document.getElementById("eu-ai-act-justification")!, {
      target: { value: "  too short " },
    });
    clickApprove();
    expect(
      await screen.findByText(
        "A justification of at least 10 characters is required when changing the EU AI Act classification.",
      ),
    ).toBeInTheDocument();
    expect(approveSubmission).not.toHaveBeenCalled();
  });

  it("sends the override with a trimmed justification", async () => {
    mockPreview();
    renderModal();
    await screen.findByText("EU AI Act classification");
    chooseLevel("Limited risk");
    fireEvent.change(document.getElementById("eu-ai-act-justification")!, {
      target: { value: "  Internal tool only.  " },
    });
    clickApprove();
    await waitFor(() => expect(approveSubmission).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(approveSubmission).mock.calls[0][1];
    expect(payload?.euAiActOverride).toEqual({
      level: "Limited risk",
      justification: "Internal tool only.",
    });
  });

  it("shows the server's message when approval fails", async () => {
    vi.mocked(approveSubmission).mockRejectedValue(
      new CustomException("Bad Request", 400, {
        message: "Bad Request",
        data: "Invalid EU AI Act classification level",
      }),
    );
    mockPreview();
    renderModal();
    await screen.findByText("EU AI Act classification");
    clickApprove();
    expect(await screen.findByText("Invalid EU AI Act classification level")).toBeInTheDocument();
  });

  it("falls back to a generic message when approval fails without a server message", async () => {
    vi.mocked(approveSubmission).mockRejectedValue(
      new CustomException("Network Error", undefined, undefined),
    );
    mockPreview();
    renderModal();
    await screen.findByText("EU AI Act classification");
    clickApprove();
    expect(
      await screen.findByText("Failed to approve submission. Please try again."),
    ).toBeInTheDocument();
  });

  it("names both results in the subtitle and the pending state", async () => {
    mockPreview();
    renderModal();
    expect(
      await screen.findByText(
        "Review the intake risk score, EU AI Act classification and entity data before approving or rejecting",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Intake risk score pending...")).toBeInTheDocument();
  });

  it("sends no override when the level is unchanged", async () => {
    mockPreview();
    renderModal();
    await screen.findByText("EU AI Act classification");
    clickApprove();
    await waitFor(() => expect(approveSubmission).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(approveSubmission).mock.calls[0][1];
    expect(payload).not.toHaveProperty("euAiActOverride");
  });
});
