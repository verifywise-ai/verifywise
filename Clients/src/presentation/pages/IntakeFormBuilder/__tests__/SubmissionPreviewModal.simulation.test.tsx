import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";
import {
  approveSubmission,
  escalateSubmission,
  getIntakeForm,
  getSubmissionPreview,
  recordSecondReview,
  rejectSubmission,
  retrySubmissionAssessment,
} from "../../../../application/repository/intakeForm.repository";
import type { PreviewRole } from "../../../../application/utils/intakeRouting/previewRole";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getSubmissionPreview: vi.fn(),
  getIntakeForm: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  escalateSubmission: vi.fn(),
  recordSecondReview: vi.fn(),
  resolveSecondReviewMiss: vi.fn(),
  retrySubmissionAssessment: vi.fn(),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "Sam", surname: "Senior" },
      { id: 2, name: "Tess", surname: "Standard" },
    ],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));

const FORM_ROUTING = {
  enabled: true,
  seniorReviewerIds: [1],
  standardReviewerIds: [2],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
};

const lane = (name: "senior" | "standard") => ({
  lane: name,
  reason: name === "senior" ? "at_or_above_threshold" : "below_threshold",
  score: name === "senior" ? 80 : 20,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-22T00:00:00.000Z",
});

const OPEN_SECOND = {
  routing: {
    ...lane("standard"),
    secondReview: { status: "open", selectedAt: "2026-10-22T00:00:00.000Z" },
  },
};

// The server answers for the signed-in user, who may decide everything and
// whose lane reviewers are not the simulated role's.
function mockPreview(extra: Record<string, unknown>, submission: Record<string, unknown> = {}) {
  vi.mocked(getSubmissionPreview).mockResolvedValue({
    data: {
      submission: { status: "pending", ...submission },
      riskAssessment: null,
      entityPreview: {},
      form: {
        id: 1,
        name: "Intake",
        entityType: "use_case",
        schema: { version: "1.0", fields: [] },
      },
      euAiActClassification: null,
      canDecide: true,
      decideBlockedReason: null,
      laneReviewers: [],
      isSeniorReviewer: true,
      routingEnabled: true,
      ...extra,
    },
  } as never);
}

const mockFormRouting = (routing: unknown = FORM_ROUTING) =>
  vi.mocked(getIntakeForm).mockResolvedValue({ data: { id: 1, routing } } as never);

const modal = (simulatedRole: PreviewRole | null, onSimulatedRoleChange = vi.fn()) => (
  <SubmissionPreviewModal
    isOpen
    onClose={vi.fn()}
    submissionId={11}
    onApproved={vi.fn()}
    onRejected={vi.fn()}
    onChanged={vi.fn()}
    simulatedRole={simulatedRole}
    onSimulatedRoleChange={onSimulatedRoleChange}
    onExitSimulation={vi.fn()}
  />
);
const renderModal = (simulatedRole: PreviewRole | null, onSimulatedRoleChange = vi.fn()) =>
  renderWithProviders(modal(simulatedRole, onSimulatedRoleChange));

beforeEach(() => {
  vi.clearAllMocks();
  mockFormRouting();
});

describe("SubmissionPreviewModal preview as a role", () => {
  it("shows the simulation banner naming the role", async () => {
    mockPreview({ routing: lane("senior") });
    renderModal("senior");
    expect(await screen.findByTestId("preview-role-banner-title")).toHaveTextContent(
      "Previewing as Senior reviewer, simulation only",
    );
  });

  it("reads the form's current routing for the submission on screen", async () => {
    mockPreview({ routing: lane("senior") });
    renderModal("standard");
    await screen.findByTestId("lane-blocked");
    expect(getIntakeForm).toHaveBeenCalledWith(1, expect.anything());
  });

  it("hides approve and reject from a standard reviewer on a senior-lane submission", async () => {
    mockPreview({ routing: lane("senior") });
    renderModal("standard");
    // Named from the form's senior list, not from the server's answer for the real user.
    await waitFor(() =>
      expect(screen.getByTestId("lane-blocked")).toHaveTextContent(
        "Only Sam Senior can decide this submission.",
      ),
    );
    expect(screen.queryByText("Approve and create use case")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject this submission instead")).not.toBeInTheDocument();
  });

  it("falls back to the lane wording when the lane has nobody left", async () => {
    mockFormRouting({ ...FORM_ROUTING, seniorReviewerIds: [99] });
    mockPreview({ routing: lane("senior") });
    renderModal("standard");
    await waitFor(() =>
      expect(screen.getByTestId("lane-blocked")).toHaveTextContent(
        "This submission is assigned to senior reviewers",
      ),
    );
  });

  it("sends an unrouted use case mapped to Prohibited to senior", async () => {
    mockPreview({
      routing: null,
      entityPreview: { ai_risk_classification: "unacceptable" },
      assessment: { version: 2, status: "complete", finalScore: 10 },
      riskAssessment: { version: 2, status: "complete", finalScore: 10 },
    });
    renderModal("standard");
    await waitFor(() =>
      expect(screen.getByTestId("lane-blocked")).toHaveTextContent(
        "Only Sam Senior can decide this submission.",
      ),
    );
    expect(screen.queryByText("Approve and create use case")).not.toBeInTheDocument();
  });

  it("keeps every decision control off while the routing loads", async () => {
    vi.mocked(getIntakeForm).mockReturnValue(new Promise(() => undefined));
    mockPreview({ routing: lane("standard") });
    renderModal("senior");
    expect(await screen.findByTestId("preview-role-banner-note")).toHaveTextContent(
      "Loading routing for this form",
    );
    expect(await screen.findByTestId("lane-blocked")).toHaveTextContent(
      "Loading routing for this form",
    );
    expect(screen.queryByText("Approve and create use case")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject this submission instead")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to senior review" })).not.toBeInTheDocument();
  });

  it("keeps every decision control off when the routing can't be loaded", async () => {
    vi.mocked(getIntakeForm).mockRejectedValue(new Error("403"));
    mockPreview(OPEN_SECOND, { status: "approved", reviewedBy: 2 });
    renderModal("senior");
    await waitFor(() =>
      expect(screen.getByTestId("preview-role-banner-note")).toHaveTextContent(
        "Could not load routing for this form",
      ),
    );
    expect(screen.getByTestId("second-review-panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agree" })).not.toBeInTheDocument();
  });

  it("shows a senior reviewer the decide buttons with every action turned off", async () => {
    mockPreview({ routing: lane("senior") });
    renderModal("senior");
    const approve = await screen.findByRole("button", { name: "Approve and create use case" });
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(approveSubmission).not.toHaveBeenCalled();

    // Opening the reject form is local; its submit stays off.
    fireEvent.click(screen.getByText("Reject this submission instead"));
    fireEvent.change(screen.getByLabelText(/Reason for rejection/), {
      target: { value: "Not enough detail on the model" },
    });
    const reject = screen.getByRole("button", { name: "Reject submission" });
    expect(reject).toBeDisabled();
    fireEvent.click(reject);
    expect(rejectSubmission).not.toHaveBeenCalled();
  });

  it("turns off Send to senior review and Retry", async () => {
    mockPreview({ routing: lane("standard") });
    renderModal("standard");
    const escalate = await screen.findByRole("button", { name: "Send to senior review" });
    expect(escalate).toBeDisabled();
    fireEvent.click(escalate);
    expect(escalateSubmission).not.toHaveBeenCalled();
    // Never queued: Retry shows for real reviewers, never in simulation.
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(retrySubmissionAssessment).not.toHaveBeenCalled();
  });

  it("turns off second-review actions for a role that may act on them", async () => {
    mockPreview(OPEN_SECOND, { status: "approved", reviewedBy: 2 });
    renderModal("senior");
    const agree = await screen.findByRole("button", { name: "Agree" });
    expect(agree).toBeDisabled();
    fireEvent.click(agree);
    expect(recordSecondReview).not.toHaveBeenCalled();
  });

  it("shows a standard reviewer an open second review as read-only", async () => {
    mockPreview(OPEN_SECOND, { status: "approved", reviewedBy: 2 });
    renderModal("standard");
    expect(await screen.findByText("A senior reviewer will check this approval.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Agree" })).not.toBeInTheDocument();
  });

  it("follows a role switch without reloading the submission", async () => {
    mockPreview({ routing: lane("senior") });
    const onSimulatedRoleChange = vi.fn();
    const view = renderModal("standard", onSimulatedRoleChange);
    expect(await screen.findByTestId("lane-blocked")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-preview-switch-role"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Admin" }));
    expect(onSimulatedRoleChange).toHaveBeenCalledWith("admin");

    view.rerender(modal("admin"));
    expect(
      await screen.findByRole("button", { name: "Approve and create use case" }),
    ).toBeDisabled();
    expect(screen.queryByTestId("lane-blocked")).not.toBeInTheDocument();
    expect(getSubmissionPreview).toHaveBeenCalledTimes(1);
    expect(getIntakeForm).toHaveBeenCalledTimes(1);
  });

  it("changes nothing without a simulated role", async () => {
    mockPreview({ routing: lane("senior") });
    renderModal(null);
    const approve = await screen.findByRole("button", { name: "Approve and create use case" });
    expect(approve).toBeEnabled();
    expect(screen.queryByTestId("preview-role-banner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(getIntakeForm).not.toHaveBeenCalled();
  });
});
