import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";
import {
  getSubmissionPreview,
  approveSubmission,
} from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1, userRoleName: "Admin" }),
}));

function mockPreview(customFields?: unknown) {
  vi.mocked(getSubmissionPreview).mockResolvedValue({
    data: {
      submission: { status: "pending", data: { f1: "Hiring tool", f2: "High", f3: "x" } },
      riskAssessment: null,
      entityPreview: { project_title: "Hiring tool" },
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
              label: "Tier question",
              type: "select",
              entityFieldMapping: "custom_field:tier",
            },
            {
              id: "f3",
              label: "Owner question",
              type: "text",
              entityFieldMapping: "custom_field:owner",
            },
          ],
        },
      },
      euAiActClassification: null,
      ...(customFields === undefined ? {} : { customFields }),
    },
  } as never);
}

function renderModal(onApproved = vi.fn()) {
  renderWithProviders(
    <SubmissionPreviewModal
      isOpen
      onClose={vi.fn()}
      submissionId={5}
      onApproved={onApproved}
      onRejected={vi.fn()}
      onChanged={vi.fn()}
    />,
  );
  return onApproved;
}

describe("SubmissionPreviewModal custom fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists mapped custom field values read-only and marks skipped ones", async () => {
    mockPreview([
      { label: "Tier", displayValue: "High" },
      { label: "Owner", displayValue: "x", skipped: "Field no longer exists" },
    ]);
    renderModal();
    expect(await screen.findByText("Custom fields")).toBeInTheDocument();
    expect(screen.getByText("Tier")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Field no longer exists")).toBeInTheDocument();
    // Read-only: no editable input for the custom-field questions
    expect(document.getElementById("entity-f2")).toBeNull();
    expect(document.getElementById("entity-f3")).toBeNull();
  });

  it("hides the block when no custom fields are mapped", async () => {
    mockPreview([]);
    renderModal();
    await screen.findByText("Intake risk score");
    expect(screen.queryByText("Custom fields")).not.toBeInTheDocument();
  });

  it("passes the skipped custom field values to onApproved", async () => {
    mockPreview();
    const skips = [{ label: "Tier", reason: "Value is not an option" }];
    vi.mocked(approveSubmission).mockResolvedValue({
      data: { customFieldSkips: skips },
    } as never);
    const onApproved = renderModal();
    await screen.findByText("Intake risk score");
    fireEvent.click(screen.getByText("Approve and create use case"));
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(skips));
  });
});
