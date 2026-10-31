import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SubmissionPreviewModal from "../SubmissionPreviewModal";

const repo = vi.hoisted(() => ({
  getSubmissionPreview: vi.fn(),
  approveSubmission: vi.fn(),
  rejectSubmission: vi.fn(),
}));
vi.mock("../../../../application/repository/intakeForm.repository", () => repo);

describe("SubmissionPreviewModal other answers", () => {
  it("lists unmapped answers, including calculated values, in a collapsed section", async () => {
    repo.getSubmissionPreview.mockResolvedValue({
      data: {
        submission: {
          id: 1,
          status: "pending",
          data: { title: "Bot", notes: "Pilot only", total: 14400, hiddenNever: undefined },
        },
        riskAssessment: null,
        entityPreview: { project_title: "Bot" },
        form: {
          id: 1,
          name: "F",
          entityType: "use_case",
          schema: {
            version: "1.0",
            fields: [
              {
                id: "title",
                type: "text",
                label: "Use case name",
                order: 0,
                entityFieldMapping: "project_title",
              },
              { id: "notes", type: "textarea", label: "Notes", order: 1 },
              {
                id: "total",
                type: "calculated",
                label: "Annual cost",
                order: 2,
                decimals: 2,
                prefix: "€",
              },
              { id: "skipped", type: "text", label: "Skipped", order: 3 },
            ],
          },
        },
        euAiActClassification: null,
      },
    });
    renderWithProviders(
      <SubmissionPreviewModal
        isOpen
        onClose={vi.fn()}
        submissionId={1}
        onApproved={vi.fn()}
        onRejected={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Other answers/ }));
    expect(screen.getByText("Pilot only")).toBeInTheDocument();
    expect(screen.getByText("€ 14,400.00")).toBeInTheDocument();
    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
  });
});
