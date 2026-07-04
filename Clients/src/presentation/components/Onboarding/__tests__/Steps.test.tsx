import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import WelcomeStep from "../steps/WelcomeStep";
import PreferencesStep from "../steps/PreferencesStep";
import AdminSetupStep from "../steps/AdminSetupStep";

const defaultStepProps = {
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  isFirstStep: true,
  isLastStep: false,
  currentStep: 0,
  totalSteps: 5,
};

describe("WelcomeStep", () => {
  it("renders the welcome heading", () => {
    renderWithProviders(<WelcomeStep {...defaultStepProps} />);
    expect(screen.getByText("Welcome to VerifyWise")).toBeInTheDocument();
  });

  it("renders the description", () => {
    renderWithProviders(<WelcomeStep {...defaultStepProps} />);
    expect(
      screen.getByText(/VerifyWise is your AI governance and compliance platform/),
    ).toBeInTheDocument();
  });

  it("renders all feature items", () => {
    renderWithProviders(<WelcomeStep {...defaultStepProps} />);
    expect(screen.getByText("How to manage AI use cases and projects")).toBeInTheDocument();
    expect(screen.getByText("Applying compliance frameworks like EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("Tracking and mitigating AI risks")).toBeInTheDocument();
    expect(screen.getByText("Setting up your organization for success")).toBeInTheDocument();
  });
});

describe("PreferencesStep", () => {
  it("renders the heading", () => {
    renderWithProviders(<PreferencesStep {...defaultStepProps} />);
    expect(screen.getByText("Tell us about yourself")).toBeInTheDocument();
  });

  it("renders radio group for primary use case", () => {
    renderWithProviders(<PreferencesStep {...defaultStepProps} />);
    expect(screen.getByText("What's your primary focus?")).toBeInTheDocument();
  });

  it("renders use case radio options", () => {
    renderWithProviders(<PreferencesStep {...defaultStepProps} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(0);
  });

  it("calls updatePreferences when a radio is selected", async () => {
    const user = userEvent.setup();
    const updatePreferences = vi.fn();
    renderWithProviders(
      <PreferencesStep
        {...defaultStepProps}
        preferences={{}}
        updatePreferences={updatePreferences}
      />,
    );
    const radios = screen.getAllByRole("radio");
    await user.click(radios[0]);
    expect(updatePreferences).toHaveBeenCalledTimes(1);
  });
});

describe("AdminSetupStep", () => {
  it("renders the heading", () => {
    renderWithProviders(<AdminSetupStep {...defaultStepProps} />);
    expect(screen.getByText("Set up your organization")).toBeInTheDocument();
  });

  it("renders the description", () => {
    renderWithProviders(<AdminSetupStep {...defaultStepProps} />);
    expect(screen.getByText(/Configure your organization settings/)).toBeInTheDocument();
  });

  it("renders all setup tasks", () => {
    renderWithProviders(<AdminSetupStep {...defaultStepProps} />);
    expect(screen.getByText("Invite team members")).toBeInTheDocument();
    expect(screen.getByText("Enable frameworks")).toBeInTheDocument();
    expect(screen.getByText("Configure organization settings")).toBeInTheDocument();
  });

  it("renders hints for each task", () => {
    renderWithProviders(<AdminSetupStep {...defaultStepProps} />);
    expect(screen.getByText("(Settings → Team)")).toBeInTheDocument();
    expect(screen.getByText("(Settings → Frameworks)")).toBeInTheDocument();
    expect(screen.getByText("(Settings → Organization)")).toBeInTheDocument();
  });

  it("renders task descriptions", () => {
    renderWithProviders(<AdminSetupStep {...defaultStepProps} />);
    expect(
      screen.getByText("Add colleagues to collaborate on compliance and risk management tasks."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Activate the compliance frameworks relevant to your organization."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Customize branding, notifications, and organizational preferences."),
    ).toBeInTheDocument();
  });
});
