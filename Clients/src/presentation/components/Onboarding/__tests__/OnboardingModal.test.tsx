import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import OnboardingModal from "../OnboardingModal";

let mockCurrentStep = 0;

const mockSetCurrentStep = vi.fn();
const mockCompleteStep = vi.fn();
const mockSkipStep = vi.fn();
const mockUpdatePreferences = vi.fn();
const mockUpdateSampleProject = vi.fn();
const mockCompleteOnboarding = vi.fn();

vi.mock("../../../../application/hooks/useOnboarding", () => ({
  useOnboarding: () => ({
    state: {
      currentStep: mockCurrentStep,
      completedSteps: [],
      skippedSteps: [],
      preferences: {},
      sampleProject: {},
      isComplete: false,
      lastUpdated: "",
    },
    isLoading: false,
    isFirstUserInOrg: true,
    isAdmin: true,
    isInvitedUser: false,
    isOrgCreator: true,
    serverOnboardingStatus: "pending",
    setCurrentStep: mockSetCurrentStep,
    completeStep: mockCompleteStep,
    skipStep: mockSkipStep,
    updatePreferences: mockUpdatePreferences,
    updateSampleProject: mockUpdateSampleProject,
    completeOnboarding: mockCompleteOnboarding,
    resetOnboarding: vi.fn(),
    shouldShowOnboarding: vi.fn().mockReturnValue(true),
  }),
}));

vi.mock("../../button/customizable-button", () => ({
  CustomizableButton: ({
    text,
    onClick,
    isDisabled,
  }: {
    text: string;
    onClick?: () => void;
    isDisabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={isDisabled} data-testid="customizable-button">
      {text}
    </button>
  ),
}));

vi.mock("../ProgressDots", () => ({
  default: () => <div data-testid="progress-dots">Progress</div>,
}));

vi.mock("../SkipConfirmation", () => ({
  default: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="skip-confirmation">
        <span>Skip confirmation</span>
        <button data-testid="confirm-skip" onClick={onConfirm}>
          Confirm
        </button>
        <button data-testid="cancel-skip" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("../steps/WelcomeStep", () => ({
  default: () => <div data-testid="welcome-step">Welcome Step</div>,
}));

vi.mock("../steps/PreferencesStep", () => ({
  default: () => <div data-testid="preferences-step">Preferences Step</div>,
}));

vi.mock("../steps/UseCasesStep", () => ({
  default: () => <div data-testid="use-cases-step">Use Cases Step</div>,
}));

vi.mock("../steps/FrameworksStep", () => ({
  default: () => <div data-testid="frameworks-step">Frameworks Step</div>,
}));

vi.mock("../steps/RiskManagementStep", () => ({
  default: () => <div data-testid="risk-management-step">Risk Management Step</div>,
}));

vi.mock("../steps/AdminSetupStep", () => ({
  default: () => <div data-testid="admin-setup-step">Admin Setup Step</div>,
}));

vi.mock("../steps/TaskWorkflowStep", () => ({
  default: () => <div data-testid="task-workflow-step">Task Workflow Step</div>,
}));

vi.mock("../steps/SampleProjectStep", () => ({
  default: () => <div data-testid="sample-project-step">Sample Project Step</div>,
}));

vi.mock("../steps/InviteTeamStep", () => ({
  default: () => <div data-testid="invite-team-step">Invite Team Step</div>,
}));

vi.mock("../steps/CompletionStep", () => ({
  default: ({ onNext }: { onNext: () => void }) => (
    <div data-testid="completion-step">
      <button onClick={onNext}>Finish</button>
    </div>
  ),
}));

describe("OnboardingModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentStep = 0;
  });

  it("renders the welcome step by default", () => {
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByTestId("welcome-step")).toBeInTheDocument();
  });

  it("renders progress dots", () => {
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByTestId("progress-dots")).toBeInTheDocument();
  });

  it("renders Skip onboarding and Next buttons", () => {
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Skip onboarding")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("does not render Back button on first step", () => {
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });

  it("renders Back button after advancing", () => {
    mockCurrentStep = 1;
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("calls setCurrentStep when Next is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Next"));
    expect(mockCompleteStep).toHaveBeenCalledWith(1);
    expect(mockSetCurrentStep).toHaveBeenCalledWith(1);
  });

  it("calls setCurrentStep when Back is clicked", async () => {
    const user = userEvent.setup();
    mockCurrentStep = 1;
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Back"));
    expect(mockSetCurrentStep).toHaveBeenCalledWith(0);
  });

  it("shows skip confirmation when Skip onboarding is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Skip onboarding"));
    expect(screen.getByTestId("skip-confirmation")).toBeInTheDocument();
  });

  it("calls confirmSkip when skip is confirmed", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={onSkip} />);
    await user.click(screen.getByText("Skip onboarding"));
    await user.click(screen.getByTestId("confirm-skip"));
    expect(mockCompleteOnboarding).toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalled();
  });

  it("shows ESC key to open skip confirmation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("skip-confirmation")).toBeInTheDocument();
  });

  it("calls onComplete when on the completion step and finish is clicked", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    mockCurrentStep = 5;
    renderWithProviders(<OnboardingModal onComplete={onComplete} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Finish"));
    expect(mockCompleteOnboarding).toHaveBeenCalled();
  });

  it("hides footer navigation on CompletionStep", () => {
    mockCurrentStep = 5;
    renderWithProviders(<OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByText("Skip onboarding")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress-dots")).not.toBeInTheDocument();
  });

  it("renders different step based on currentStep", () => {
    const steps = [
      { step: 0, testId: "welcome-step" },
      { step: 1, testId: "use-cases-step" },
      { step: 2, testId: "frameworks-step" },
      { step: 3, testId: "risk-management-step" },
      { step: 4, testId: "invite-team-step" },
      { step: 5, testId: "completion-step" },
    ];

    steps.forEach(({ step, testId }) => {
      mockCurrentStep = step;
      const { unmount } = renderWithProviders(
        <OnboardingModal onComplete={vi.fn()} onSkip={vi.fn()} />,
      );
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      unmount();
    });
  });
});
