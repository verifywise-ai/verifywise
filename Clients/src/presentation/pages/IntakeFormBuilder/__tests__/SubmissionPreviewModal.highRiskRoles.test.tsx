import { screen, fireEvent, waitFor, within } from "@testing-library/react";
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

function mockPreview(entityPreview: Record<string, unknown>) {
  vi.mocked(getSubmissionPreview).mockResolvedValue({
    data: {
      submission: { status: "pending" },
      riskAssessment: null,
      entityPreview,
      form: {
        id: 1,
        name: "Intake",
        entityType: "use_case",
        schema: {
          version: "1.0",
          fields: [
            { id: "f1", label: "Title", type: "text", entityFieldMapping: "project_title" },
            {
              id: "f_role",
              label: "Your role",
              type: "multiselect",
              entityFieldMapping: "type_of_high_risk_role",
              options: [
                { value: "opt_1", label: "Provider" },
                { value: "opt_2", label: "Importer" },
              ],
            },
          ],
        },
      },
      euAiActClassification: null,
    },
  } as never);
}

const renderModal = () =>
  renderWithProviders(
    <SubmissionPreviewModal
      isOpen
      onClose={vi.fn()}
      submissionId={5}
      onApproved={vi.fn()}
      onRejected={vi.fn()}
      onChanged={vi.fn()}
    />,
  );

describe("SubmissionPreviewModal high-risk roles mapping", () => {
  beforeEach(() => {
    vi.mocked(approveSubmission).mockReset();
    vi.mocked(approveSubmission).mockResolvedValue({ data: {} } as never);
  });

  it("shows the matched roles in a multi-select and lists options that are not roles", async () => {
    mockPreview({
      project_title: "Hiring tool",
      high_risk_roles: ["Provider"],
      high_risk_roles_unmatched: ["Importer"],
    });
    renderModal();
    expect(await screen.findByText("High-risk roles")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Not a high-risk role:")).toBeInTheDocument();
    expect(screen.getByText("Importer")).toBeInTheDocument();
  });

  it("sends the roles the reviewer picked", async () => {
    mockPreview({ project_title: "Hiring tool", high_risk_roles: ["Provider"] });
    renderModal();
    await screen.findByText("High-risk roles");
    fireEvent.keyDown(document.getElementById("entity-f_role")!, { key: "ArrowDown" });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Deployer"));
    fireEvent.click(screen.getByText("Approve and create use case"));
    await waitFor(() => expect(approveSubmission).toHaveBeenCalled());
    expect(vi.mocked(approveSubmission).mock.calls[0][1]?.confirmedEntityData).toMatchObject({
      high_risk_roles: ["Provider", "Deployer"],
    });
  });

  it("treats a blank answer (empty list) as no role", async () => {
    mockPreview({ project_title: "Hiring tool", high_risk_roles: [] });
    renderModal();
    expect(await screen.findByText("High-risk roles")).toBeInTheDocument();
    expect(screen.queryByText("Not a high-risk role:")).toBeNull();
  });
});
