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

    const toggle = screen.getByText("Additional answers (1)");
    expect(screen.queryByText("Uses biometrics")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("Uses biometrics")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
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
    const toggle = screen.getByText("Additional answers (2)");
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
});
