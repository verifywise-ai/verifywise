import {
  OnboardingRole,
  OnboardingIndustry,
  OnboardingUseCase,
  IllustrationType,
} from "../../../domain/enums/onboarding.enum";

export interface UserPreferences {
  role?: OnboardingRole;
  industry?: OnboardingIndustry;
  primaryUseCase?: OnboardingUseCase;
}

export interface SampleProjectData {
  useCaseName?: string;
  selectedFrameworks?: number[];
}

export interface OnboardingState {
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  preferences: UserPreferences;
  sampleProject: SampleProjectData;
  isComplete: boolean;
  lastUpdated: string;
}

export interface OnboardingStepConfig {
  id: number;
  title: string;
  description: string;
  componentName: string;
  illustration: IllustrationType;
  showForAdmin: boolean;
  showForUser: boolean;
  canSkip: boolean;
  requiresInput: boolean;
}

export interface OnboardingModalProps {
  onComplete?: () => void;
  onSkip?: () => void;
  isRevisit?: boolean;
}

export interface OnboardingStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  currentStep: number;
  totalSteps: number;
  preferences?: UserPreferences;
  sampleProject?: SampleProjectData;
  updatePreferences?: (prefs: Partial<UserPreferences>) => void;
  updateSampleProject?: (data: Partial<SampleProjectData>) => void;
}
