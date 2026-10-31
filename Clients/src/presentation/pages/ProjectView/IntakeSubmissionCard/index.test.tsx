import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockUseEntityIntakeSubmission = vi.fn();
vi.mock("../../../../application/hooks/useEntityIntakeSubmission", () => ({
  useEntityIntakeSubmission: (...args: any[]) => mockUseEntityIntakeSubmission(...args),
}));

import IntakeSubmissionCard from "./index";
import type { EntityIntakeSubmission } from "../../../../application/repository/intakeForm.repository";

const baseSubmission: EntityIntakeSubmission = {
  submissionId: 1,
  formName: "AI Use Case Intake",
  submitterName: "Jane Doe",
  submitterEmail: "jane@example.com",
  submittedAt: "2024-05-01T00:00:00Z",
  reviewedAt: null,
  riskTier: "High",
  fields: [
    {
      fieldId: "f1",
      label: "System name",
      type: "text",
      value: "Chatbot",
      options: null,
      entityFieldMapping: "name",
      isMapped: true,
    },
    {
      fieldId: "f2",
      label: "Uses biometrics",
      type: "checkbox",
      value: true,
      options: null,
      entityFieldMapping: null,
      isMapped: false,
    },
  ],
};

describe("IntakeSubmissionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while loading", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when there is no submission", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({ data: null, isLoading: false });
    const { container } = renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the submission has no fields with values", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      data: { ...baseSubmission, fields: [] },
      isLoading: false,
    });
    const { container } = renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    expect(container.textContent).toBe("");
  });

  it("renders mapped fields, form meta line, and toggles additional answers", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({ data: baseSubmission, isLoading: false });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);

    expect(screen.getByText("Intake form submission")).toBeInTheDocument();
    expect(screen.getByText("System name")).toBeInTheDocument();
    expect(screen.getByText("Chatbot")).toBeInTheDocument();
    expect(screen.getByText(/AI Use Case Intake/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Risk: High/)).toBeInTheDocument();

    const toggle = screen.getByText("Additional answers");
    expect(toggle.parentElement).toHaveTextContent("Additional answers (1)");
    expect(screen.queryByText("Uses biometrics")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("Uses biometrics")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("shows an AI-scored submission as its score and band", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      data: { ...baseSubmission, riskScore: { finalScore: 64, rulesOnly: false } },
      isLoading: false,
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    expect(screen.getByText("Risk score:")).toBeInTheDocument();
    expect(screen.getByText(/64 \(/)).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.queryByText(/Risk: High/)).toBeNull();
  });

  it("shows an override band apart from the score's own band", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      data: {
        ...baseSubmission,
        riskTier: "Critical",
        riskOverrideTier: "Critical",
        riskScore: { finalScore: 40, rulesOnly: false, band: "Medium" },
      },
      isLoading: false,
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("band set to")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("shows a rules-only score as at least N (rules only)", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      data: { ...baseSubmission, riskScore: { finalScore: 70, rulesOnly: true } },
      isLoading: false,
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    expect(screen.getByText("at least")).toBeInTheDocument();
    expect(screen.getByText("(rules only)")).toBeInTheDocument();
  });

  it("shows unmapped-only fields behind the 'Additional answers' toggle", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      data: {
        ...baseSubmission,
        fields: baseSubmission.fields.map((f) => ({ ...f, isMapped: false })),
      },
      isLoading: false,
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);

    expect(screen.queryByText("System name")).not.toBeInTheDocument();
    const toggle = screen.getByText("Additional answers");
    expect(toggle.parentElement).toHaveTextContent("Additional answers (2)");
    fireEvent.click(toggle);
    expect(screen.getByText("System name")).toBeInTheDocument();
    expect(screen.getByText("Uses biometrics")).toBeInTheDocument();
  });

  it("renders a dash for empty values and 'No' for a false checkbox", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      data: {
        ...baseSubmission,
        fields: [
          {
            fieldId: "f3",
            label: "Notes",
            type: "text",
            value: "",
            options: null,
            entityFieldMapping: null,
            isMapped: false,
          },
        ],
      },
      isLoading: false,
    });
    const { container } = renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    // "Notes" field has an empty value, so it's filtered out entirely.
    expect(container.textContent).toBe("");
  });

  it("resolves select and multiselect field values against their options", () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      data: {
        ...baseSubmission,
        fields: [
          {
            fieldId: "f4",
            label: "Deployment type",
            type: "select",
            value: "cloud",
            options: [
              { label: "Cloud", value: "cloud" },
              { label: "On-premise", value: "on_prem" },
            ],
            entityFieldMapping: null,
            isMapped: true,
          },
          {
            fieldId: "f5",
            label: "Affected groups",
            type: "multiselect",
            value: ["minors", "elderly"],
            options: [
              { label: "Minors", value: "minors" },
              { label: "Elderly", value: "elderly" },
            ],
            entityFieldMapping: null,
            isMapped: true,
          },
        ],
      },
      isLoading: false,
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);

    expect(screen.getByText("Cloud")).toBeInTheDocument();
    expect(screen.getByText("Minors, Elderly")).toBeInTheDocument();
  });

  it("shows a calculated value and a dash for a stored empty result", async () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      isLoading: false,
      data: {
        ...baseSubmission,
        fields: [
          {
            fieldId: "total",
            label: "Annual cost",
            type: "calculated",
            value: 14400,
            answered: true,
            decimals: 2,
            prefix: "€",
            suffix: null,
            options: null,
            entityFieldMapping: null,
            isMapped: false,
          },
          {
            fieldId: "ratio",
            label: "Ratio",
            type: "calculated",
            value: null,
            answered: true,
            decimals: 2,
            prefix: null,
            suffix: null,
            options: null,
            entityFieldMapping: null,
            isMapped: false,
          },
        ],
      },
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    fireEvent.click(await screen.findByText(/Additional answers/));
    expect(screen.getByText("€ 14,400.00")).toBeInTheDocument();
    expect(screen.getByText("Ratio")).toBeInTheDocument();
  });

  it("omits a calculated field the submission never stored", async () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      isLoading: false,
      data: {
        ...baseSubmission,
        fields: [
          {
            fieldId: "name",
            label: "Use case name",
            type: "text",
            value: "Bot",
            answered: true,
            options: null,
            entityFieldMapping: "project_title",
            isMapped: true,
          },
          {
            fieldId: "old",
            label: "Old total",
            type: "calculated",
            value: null,
            answered: false,
            decimals: null,
            prefix: null,
            suffix: null,
            options: null,
            entityFieldMapping: null,
            isMapped: false,
          },
        ],
      },
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    await screen.findByText("Bot");
    expect(screen.queryByText("Old total")).not.toBeInTheDocument();
    expect(screen.queryByText(/Additional answers/)).not.toBeInTheDocument();
  });

  it("does not list an empty multiselect as an answer", async () => {
    mockUseEntityIntakeSubmission.mockReturnValue({
      isLoading: false,
      data: {
        ...baseSubmission,
        fields: [
          {
            fieldId: "name",
            label: "Use case name",
            type: "text",
            value: "Bot",
            options: null,
            entityFieldMapping: "project_title",
            isMapped: true,
          },
          {
            fieldId: "tags",
            label: "Data kinds",
            type: "multiselect",
            value: [],
            options: [],
            entityFieldMapping: null,
            isMapped: false,
          },
        ],
      },
    });
    renderWithProviders(<IntakeSubmissionCard projectId={1} />);
    await screen.findByText("Bot");
    expect(screen.queryByText(/Additional answers/)).not.toBeInTheDocument();
  });
});
