import { OnboardingStepConfig } from "../../types/interfaces/i.onboarding";
import { IllustrationType } from "../../../domain/enums/onboarding.enum";

export const ONBOARDING_DURATION = "3 minutes";

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: 1,
    title: "Welcome to VerifyWise",
    description:
      "Your AI governance and compliance platform. In 3 minutes, we'll help you get started with managing AI risks, compliance frameworks, and building trust.",
    componentName: "WelcomeStep",
    illustration: IllustrationType.GRADIENT_CIRCLES,
    showForAdmin: true,
    showForUser: true,
    canSkip: true,
    requiresInput: false,
  },
  {
    id: 3,
    title: "Manage Your AI Use Cases",
    description:
      "Create and track AI projects, assign teams, and monitor compliance status across all your initiatives.",
    componentName: "UseCasesStep",
    illustration: IllustrationType.FLOW_DIAGRAM,
    showForAdmin: true,
    showForUser: true,
    canSkip: true,
    requiresInput: false,
  },
  {
    id: 4,
    title: "Apply Compliance Frameworks",
    description:
      "Map your projects to regulations like EU AI Act, ISO 42001, and ISO 27001 to ensure comprehensive compliance.",
    componentName: "FrameworksStep",
    illustration: IllustrationType.GEOMETRIC_SHAPES,
    showForAdmin: true,
    showForUser: true,
    canSkip: true,
    requiresInput: false,
  },
  {
    id: 5,
    title: "Identify and Mitigate Risks",
    description:
      "Track risks, assign mitigation tasks, and monitor progress to maintain control over your AI systems.",
    componentName: "RiskManagementStep",
    illustration: IllustrationType.ABSTRACT_WAVES,
    showForAdmin: true,
    showForUser: true,
    canSkip: true,
    requiresInput: false,
  },
  {
    id: 9,
    title: "Invite Team Members",
    description: "Invite up to 5 people to your organization",
    componentName: "InviteTeamStep",
    illustration: IllustrationType.ICON_GRID,
    showForAdmin: true,
    showForUser: true,
    canSkip: true,
    requiresInput: false,
  },
  {
    id: 10,
    title: "Congratulations",
    description: "You are ready to work with VerifyWise",
    componentName: "CompletionStep",
    illustration: IllustrationType.GRADIENT_CIRCLES,
    showForAdmin: true,
    showForUser: true,
    canSkip: false,
    requiresInput: false,
  },
];

export const SKIP_CONFIRMATION_TEXT = {
  title: "Are you sure you want to skip?",
  message: "You can always revisit this onboarding from your profile menu.",
  confirmButton: "Skip",
  cancelButton: "Continue onboarding",
};

export const DEMO_PROJECT_BANNER = {
  message: "This is a demo project - you can delete it anytime",
  icon: "⚠️",
};
