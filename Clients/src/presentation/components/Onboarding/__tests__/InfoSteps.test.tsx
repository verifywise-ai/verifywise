import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import UseCasesStep from "../steps/UseCasesStep";
import FrameworksStep from "../steps/FrameworksStep";
import RiskManagementStep from "../steps/RiskManagementStep";
import TaskWorkflowStep from "../steps/TaskWorkflowStep";

vi.mock("../../Alert", () => ({
  default: ({ body }: { body: string }) => <div data-testid="alert">{body}</div>,
}));

const defaultStepProps = {
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  isFirstStep: false,
  isLastStep: false,
  currentStep: 2,
  totalSteps: 5,
};

describe("UseCasesStep", () => {
  it("renders the heading", () => {
    renderWithProviders(<UseCasesStep {...defaultStepProps} />);
    expect(screen.getByText("Manage your AI use cases")).toBeInTheDocument();
  });

  it("renders feature cards", () => {
    renderWithProviders(<UseCasesStep {...defaultStepProps} />);
    expect(screen.getByText("Create use cases")).toBeInTheDocument();
    expect(screen.getByText("Assign teams")).toBeInTheDocument();
    expect(screen.getByText("Track status")).toBeInTheDocument();
    expect(screen.getByText("Ensure compliance")).toBeInTheDocument();
  });
});

describe("FrameworksStep", () => {
  it("renders the heading", () => {
    renderWithProviders(<FrameworksStep {...defaultStepProps} />);
    expect(screen.getByText("Apply compliance frameworks")).toBeInTheDocument();
  });

  it("renders framework cards", () => {
    renderWithProviders(<FrameworksStep {...defaultStepProps} />);
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
  });
});

describe("RiskManagementStep", () => {
  it("renders the heading", () => {
    renderWithProviders(<RiskManagementStep {...defaultStepProps} />);
    expect(screen.getByText("Identify and mitigate risks")).toBeInTheDocument();
  });

  it("renders capability cards", () => {
    renderWithProviders(<RiskManagementStep {...defaultStepProps} />);
    expect(screen.getByText("Identify risks")).toBeInTheDocument();
    expect(screen.getByText("Assign ownership")).toBeInTheDocument();
    expect(screen.getByText("Track progress")).toBeInTheDocument();
    expect(screen.getByText("Close risks")).toBeInTheDocument();
  });
});

describe("TaskWorkflowStep", () => {
  it("renders the heading", () => {
    renderWithProviders(<TaskWorkflowStep {...defaultStepProps} />);
    expect(screen.getByText("Your daily workflow")).toBeInTheDocument();
  });

  it("renders workflow step cards", () => {
    renderWithProviders(<TaskWorkflowStep {...defaultStepProps} />);
    expect(screen.getByText("Receive notifications")).toBeInTheDocument();
    expect(screen.getByText("Complete tasks")).toBeInTheDocument();
    expect(screen.getByText("Collaborate")).toBeInTheDocument();
    expect(screen.getByText("Track progress")).toBeInTheDocument();
  });

  it("renders the alert", () => {
    renderWithProviders(<TaskWorkflowStep {...defaultStepProps} />);
    expect(screen.getByTestId("alert")).toBeInTheDocument();
  });
});
