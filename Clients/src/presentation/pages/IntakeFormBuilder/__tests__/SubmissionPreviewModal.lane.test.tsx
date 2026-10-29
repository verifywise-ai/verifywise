import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";
import {
  getSubmissionPreview,
  recordSecondReview,
} from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  escalateSubmission: vi.fn(),
  recordSecondReview: vi.fn(),
  resolveSecondReviewMiss: vi.fn(),
}));

const SENIOR_LANE = {
  lane: "senior",
  reason: "at_or_above_threshold",
  score: 80,
  threshold: 50,
  closeCallMargin: 10,
  routedAt: "2026-10-22T00:00:00.000Z",
};

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
      ...extra,
    },
  } as never);
}

const renderModal = (onApproved = vi.fn(), onChanged = vi.fn()) =>
  renderWithProviders(
    <SubmissionPreviewModal
      isOpen
      onClose={vi.fn()}
      submissionId={11}
      onApproved={onApproved}
      onRejected={vi.fn()}
      onChanged={onChanged}
    />,
  );

describe("SubmissionPreviewModal lane", () => {
  it("hides approve and reject and names the reviewers when the user can't decide", async () => {
    mockPreview({
      routing: SENIOR_LANE,
      routingEnabled: true,
      canDecide: false,
      decideBlockedReason: "This submission is assigned to senior reviewers",
      laneReviewers: [{ id: 1, name: "Sam Senior" }],
    });
    renderModal();
    expect(await screen.findByTestId("lane-blocked")).toHaveTextContent(
      "Only Sam Senior can decide this submission.",
    );
    expect(screen.getByText("Senior review")).toBeInTheDocument();
    expect(screen.queryByText("Approve and create use case")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject this submission instead")).not.toBeInTheDocument();
  });

  it("keeps the decide buttons and shows no lane section when routing is off", async () => {
    mockPreview({ routing: null, canDecide: true, laneReviewers: [] });
    renderModal();
    expect(await screen.findByText("Approve and create use case")).toBeInTheDocument();
    expect(screen.getByText("Reject this submission instead")).toBeInTheDocument();
    expect(screen.queryByTestId("lane-section")).not.toBeInTheDocument();
  });

  it("hides the lane section and Send to senior review when routing is off", async () => {
    mockPreview({
      routing: { ...SENIOR_LANE, lane: "standard" },
      routingEnabled: false,
      canDecide: true,
      laneReviewers: [{ id: 1, name: "Sam Senior" }],
    });
    renderModal();
    expect(await screen.findByText("Approve and create use case")).toBeInTheDocument();
    expect(screen.queryByTestId("lane-section")).not.toBeInTheDocument();
    expect(screen.queryByText("Send to senior review")).not.toBeInTheDocument();
  });

  it("shows an open second review to a senior reviewer who didn't approve", async () => {
    mockPreview(
      {
        routing: {
          ...SENIOR_LANE,
          lane: "standard",
          secondReview: { status: "open", selectedAt: "2026-10-22T00:00:00.000Z" },
        },
        routingEnabled: true,
        canDecide: true,
        laneReviewers: [{ id: 1, name: "Sam Senior" }],
        isSeniorReviewer: true,
      },
      { status: "approved", reviewedBy: 2 },
    );
    renderModal();
    expect(await screen.findByRole("button", { name: "Agree" })).toBeInTheDocument();
  });

  it("tells the parent when a second review is recorded so the list refreshes", async () => {
    const openSecond = { status: "open", selectedAt: "2026-10-22T00:00:00.000Z" };
    mockPreview(
      {
        routing: { ...SENIOR_LANE, lane: "standard", secondReview: openSecond },
        routingEnabled: true,
        canDecide: true,
        laneReviewers: [{ id: 1, name: "Sam Senior" }],
        isSeniorReviewer: true,
      },
      { status: "approved", reviewedBy: 2 },
    );
    vi.mocked(recordSecondReview).mockResolvedValue({
      data: {
        ...SENIOR_LANE,
        lane: "standard",
        secondReview: { ...openSecond, status: "agreed", reviewedAt: "2026-10-23T00:00:00.000Z" },
      },
    } as never);
    const onApproved = vi.fn();
    const onChanged = vi.fn();
    renderModal(onApproved, onChanged);
    fireEvent.click(await screen.findByRole("button", { name: "Agree" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    // Recording a second review is not a new approval
    expect(onApproved).not.toHaveBeenCalled();
  });
});
