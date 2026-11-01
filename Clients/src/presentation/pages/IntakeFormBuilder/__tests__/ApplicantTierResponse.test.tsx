import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ApplicantTierResponse from "../ApplicantTierResponse";

const repo = vi.hoisted(() => ({ getSubmissionTierSuggestionResponse: vi.fn() }));
vi.mock("../../../../application/repository/intakeTierSuggestion.repository", () => repo);

beforeEach(() => vi.clearAllMocks());

describe("ApplicantTierResponse", () => {
  it("shows an accepted suggestion", async () => {
    repo.getSubmissionTierSuggestionResponse.mockResolvedValue({
      suggestedLevel: "High risk",
      questionnaireVersion: 2,
      accepted: true,
      context: null,
      respondedAt: "2026-10-31T10:00:00.000Z",
    });
    renderWithProviders(<ApplicantTierResponse submissionId={12} />);
    expect(await screen.findByText("Accepted the suggestion")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(repo.getSubmissionTierSuggestionResponse).toHaveBeenCalledWith(12);
  });

  it("shows the context the applicant added", async () => {
    repo.getSubmissionTierSuggestionResponse.mockResolvedValue({
      suggestedLevel: "High risk",
      questionnaireVersion: 2,
      accepted: false,
      context: "We only rank internal staff.",
      respondedAt: "2026-10-31T10:00:00.000Z",
    });
    renderWithProviders(<ApplicantTierResponse submissionId={12} />);
    expect(await screen.findByTestId("applicant-tier-context")).toHaveTextContent(
      "We only rank internal staff.",
    );
  });

  it("shows nothing without a response", async () => {
    repo.getSubmissionTierSuggestionResponse.mockResolvedValue(null);
    renderWithProviders(<ApplicantTierResponse submissionId={12} />);
    await waitFor(() => expect(repo.getSubmissionTierSuggestionResponse).toHaveBeenCalled());
    expect(screen.queryByTestId("applicant-tier-response")).toBeNull();
  });
});
