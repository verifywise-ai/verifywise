import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";
import {
  getSubmissionPreview,
  approveSubmission,
  rejectSubmission,
  escalateSubmission,
} from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
  escalateSubmission: vi.fn(),
}));

// User 1 is a standard-lane reviewer, so Send to senior review shows when routing is on
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, userRoleName: "Reviewer" }),
}));

function mockPreview(extra: Record<string, unknown> = {}) {
  vi.mocked(getSubmissionPreview).mockResolvedValue({
    data: {
      submission: { status: "pending" },
      riskAssessment: null,
      entityPreview: { project_title: "Hiring tool" },
      form: {
        id: 1,
        name: "Intake",
        entityType: "use_case",
        schema: {
          version: "1.0",
          fields: [{ id: "f1", label: "Title", type: "text", entityFieldMapping: "project_title" }],
        },
      },
      euAiActClassification: null,
      ...extra,
    },
  } as never);
}

function renderModal(props: {
  onApproved?: () => void;
  onRejected?: () => void;
  onChanged?: () => void;
  onClose?: () => void;
}) {
  return renderWithProviders(
    <SubmissionPreviewModal
      isOpen
      onClose={props.onClose ?? vi.fn()}
      submissionId={5}
      onApproved={props.onApproved ?? vi.fn()}
      onRejected={props.onRejected ?? vi.fn()}
      onChanged={props.onChanged ?? vi.fn()}
    />,
  );
}

function clickApprove() {
  fireEvent.click(screen.getByText("Approve and create use case"));
}

function clickReject() {
  fireEvent.click(screen.getByText("Reject this submission instead"));
  fireEvent.change(document.getElementById("reject-reason")!, {
    target: { value: "Not enough detail provided." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reject submission" }));
}

describe("SubmissionPreviewModal review feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports approval only through onApproved", async () => {
    vi.mocked(approveSubmission).mockResolvedValue({ data: {} } as never);
    const onApproved = vi.fn();
    const onRejected = vi.fn();
    const onClose = vi.fn();
    mockPreview();
    renderModal({ onApproved, onRejected, onClose });
    await screen.findByText("Intake risk score");
    clickApprove();
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
    expect(onRejected).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports rejection only through onRejected, never as an approval", async () => {
    vi.mocked(rejectSubmission).mockResolvedValue({ data: {} } as never);
    const onApproved = vi.fn();
    const onRejected = vi.fn();
    const onClose = vi.fn();
    mockPreview();
    renderModal({ onApproved, onRejected, onClose });
    await screen.findByText("Intake risk score");
    clickReject();
    await waitFor(() => expect(onRejected).toHaveBeenCalledTimes(1));
    expect(onApproved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an error and reports nothing when approval fails", async () => {
    vi.mocked(approveSubmission).mockRejectedValue(new Error("Network Error"));
    const onApproved = vi.fn();
    const onClose = vi.fn();
    mockPreview();
    renderModal({ onApproved, onClose });
    await screen.findByText("Intake risk score");
    clickApprove();
    expect(
      await screen.findByText("Failed to approve submission. Please try again."),
    ).toBeInTheDocument();
    expect(onApproved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an error and reports nothing when rejection fails", async () => {
    vi.mocked(rejectSubmission).mockRejectedValue(new Error("Network Error"));
    const onApproved = vi.fn();
    const onRejected = vi.fn();
    const onClose = vi.fn();
    mockPreview();
    renderModal({ onApproved, onRejected, onClose });
    await screen.findByText("Intake risk score");
    clickReject();
    expect(
      await screen.findByText("Failed to reject submission. Please try again."),
    ).toBeInTheDocument();
    expect(onApproved).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports an escalation as a change, never as an approval", async () => {
    vi.mocked(escalateSubmission).mockResolvedValue({ data: {} } as never);
    const onApproved = vi.fn();
    const onRejected = vi.fn();
    const onChanged = vi.fn();
    mockPreview({
      routing: {
        lane: "standard",
        reason: "below_threshold",
        score: 20,
        threshold: 50,
        closeCallMargin: 10,
        routedAt: "2026-10-22T00:00:00.000Z",
      },
      routingEnabled: true,
      canDecide: true,
      laneReviewers: [{ id: 1, name: "Sam Standard" }],
    });
    renderModal({ onApproved, onRejected, onChanged });
    fireEvent.click(await screen.findByRole("button", { name: "Request expert review" }));
    fireEvent.change(document.getElementById("escalate-reason")!, {
      target: { value: "Touches hiring decisions." },
    });
    const sendButtons = screen.getAllByRole("button", { name: "Request expert review" });
    fireEvent.click(sendButtons[sendButtons.length - 1]);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onApproved).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("sends one approval when approve is clicked twice", async () => {
    type ApproveResult = Awaited<ReturnType<typeof approveSubmission>>;
    let resolveApprove!: (value: ApproveResult) => void;
    vi.mocked(approveSubmission).mockImplementation(
      () => new Promise<ApproveResult>((resolve) => (resolveApprove = resolve)),
    );
    mockPreview();
    renderModal({});
    await screen.findByText("Intake risk score");
    clickApprove();
    clickApprove();
    resolveApprove({ data: { submission: {} as never, createdEntity: null } });
    await waitFor(() => expect(approveSubmission).toHaveBeenCalledTimes(1));
  });
});
