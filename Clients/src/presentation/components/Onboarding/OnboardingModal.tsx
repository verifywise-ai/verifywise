import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Box, Stack } from "@mui/material";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useOnboarding } from "../../../application/hooks/useOnboarding";
import { ONBOARDING_STEPS } from "./onboardingConstants";
import ProgressDots from "./ProgressDots";
import SkipConfirmation from "./SkipConfirmation";
import { CustomizableButton } from "../button/customizable-button";
import { OnboardingModalProps } from "../../types/interfaces/i.onboarding";
import WelcomeStep from "./steps/WelcomeStep";
import PreferencesStep from "./steps/PreferencesStep";
import UseCasesStep from "./steps/UseCasesStep";
import FrameworksStep from "./steps/FrameworksStep";
import RiskManagementStep from "./steps/RiskManagementStep";
import AdminSetupStep from "./steps/AdminSetupStep";
import TaskWorkflowStep from "./steps/TaskWorkflowStep";
import SampleProjectStep from "./steps/SampleProjectStep";
import InviteTeamStep from "./steps/InviteTeamStep";
import CompletionStep from "./steps/CompletionStep";
import { brand, text, border as borderPalette, status } from "../../themes/palette";

const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onComplete,
  onSkip,
  isRevisit = false,
}) => {
  const {
    state,
    isAdmin,
    isInvitedUser,
    setCurrentStep,
    completeStep,
    skipStep,
    updatePreferences,
    updateSampleProject,
    completeOnboarding,
  } = useOnboarding();

  const [showSkipConfirmation, setShowSkipConfirmation] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Filter steps based on user role and invited status
  const availableSteps = useMemo(() => {
    return ONBOARDING_STEPS.filter((step) => {
      // Skip sample project creation on revisit or for invited users
      if (isRevisit && step.id === 8) return false;
      if (isInvitedUser && step.id === 8) return false;

      // Filter based on admin/user role
      if (isAdmin) {
        return step.showForAdmin;
      } else {
        return step.showForUser;
      }
    });
  }, [isAdmin, isInvitedUser, isRevisit]);

  const currentStepIndex = state.currentStep;
  const currentStepConfig = availableSteps[currentStepIndex];
  const totalSteps = availableSteps.length;

  // Handle ESC key to show skip confirmation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !showSkipConfirmation) {
        event.preventDefault();
        setShowSkipConfirmation(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSkipConfirmation]);

  // Navigation handlers
  const handleNext = useCallback(() => {
    // If we're on CompletionStep, just close the modal
    if (currentStepConfig.componentName === "CompletionStep") {
      completeStep(currentStepConfig.id);
      completeOnboarding();
      setIsClosing(true);
      setTimeout(() => {
        onComplete?.();
      }, 400); // Match fade duration
      return;
    }

    // Mark current step as complete
    completeStep(currentStepConfig.id);

    // Advance to next step if available
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStep(currentStepIndex + 1);
    }
  }, [currentStepIndex, totalSteps, currentStepConfig, completeStep, setCurrentStep, completeOnboarding, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStep(currentStepIndex - 1);
    }
  }, [currentStepIndex, setCurrentStep]);

  const handleSkipStep = useCallback(() => {
    setShowSkipConfirmation(true);
  }, []);

  const confirmSkip = useCallback(() => {
    // Mark all steps as skipped
    availableSteps.forEach((step) => skipStep(step.id));
    setShowSkipConfirmation(false);
    completeOnboarding();
    onSkip?.();
  }, [availableSteps, skipStep, completeOnboarding, onSkip]);

  const cancelSkip = useCallback(() => {
    setShowSkipConfirmation(false);
  }, []);

  // Get the appropriate step component
  const StepComponent = useMemo(() => {
    switch (currentStepConfig.componentName) {
      case "WelcomeStep":
        return WelcomeStep;
      case "PreferencesStep":
        return PreferencesStep;
      case "UseCasesStep":
        return UseCasesStep;
      case "FrameworksStep":
        return FrameworksStep;
      case "RiskManagementStep":
        return RiskManagementStep;
      case "AdminSetupStep":
        return AdminSetupStep;
      case "TaskWorkflowStep":
        return TaskWorkflowStep;
      case "SampleProjectStep":
        return SampleProjectStep;
      case "InviteTeamStep":
        return InviteTeamStep;
      case "CompletionStep":
        return CompletionStep;
      default:
        return WelcomeStep;
    }
  }, [currentStepConfig]);

  const stepProps = {
    onNext: handleNext,
    onBack: handleBack,
    onSkip: handleSkipStep,
    isFirstStep: currentStepIndex === 0,
    isLastStep: currentStepIndex === totalSteps - 1,
    currentStep: currentStepIndex,
    totalSteps,
    preferences: state.preferences,
    sampleProject: state.sampleProject,
    updatePreferences,
    updateSampleProject,
  };

  return (
    <>
      <Box
        className="confirmation-backdrop"
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: 2,
          animation: isClosing ? "fadeOut 0.4s ease-out" : "fadeIn 0.3s ease-in",
          "@keyframes fadeOut": {
            from: {
              opacity: 1,
            },
            to: {
              opacity: 0,
            },
          },
          "@keyframes fadeIn": {
            from: {
              opacity: 0,
            },
            to: {
              opacity: 1,
            },
          },
        }}
      >
        <Box
          role="dialog"
          aria-modal="true"
          sx={{
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            width: "60%",
            maxWidth: "900px",
            maxHeight: "90vh",
            overflow: "auto",
            position: "relative",
          }}
        >
          {/* Step content with fade animation */}
          <Box
            sx={{
              padding: "32px",
              minHeight: "400px",
              position: "relative",
              overflow: "visible",
            }}
          >
            <Box
              key={currentStepIndex}
              sx={{
                animation: "fadeIn 0.4s ease-in-out",
                "@keyframes fadeIn": {
                  from: {
                    opacity: 0,
                  },
                  to: {
                    opacity: 1,
                  },
                },
              }}
            >
              <StepComponent {...stepProps} />
            </Box>
          </Box>

          {/* Footer with progress and navigation - Hidden on completion step */}
          {currentStepConfig.componentName !== "CompletionStep" && (
            <Box
              sx={{
                padding: "32px",
                paddingTop: 0,
              }}
            >
              <Stack spacing={1.5}>
                <ProgressDots totalSteps={totalSteps} currentStep={currentStepIndex} />

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <CustomizableButton
                    variant="text"
                    text="Skip onboarding"
                    onClick={handleSkipStep}
                    sx={{
                      color: `${status.default.text}`,
                      "&:hover": {
                        backgroundColor: "transparent",
                        color: "#374151",
                      },
                    }}
                  />

                  <Stack direction="row" gap={2}>
                    {!stepProps.isFirstStep && (
                      <CustomizableButton
                        variant="outlined"
                        text="Back"
                        onClick={handleBack}
                        startIcon={<ArrowLeft size={16} />}
                        sx={{
                          borderColor: `${borderPalette.dark}`,
                          color: `${text.secondary}`,
                          "&:hover": {
                            borderColor: `${text.muted}`,
                          },
                        }}
                      />
                    )}
                    <CustomizableButton
                      variant="contained"
                      text="Next"
                      onClick={handleNext}
                      endIcon={<ArrowRight size={16} />}
                      sx={{
                        backgroundColor: `${brand.primary}`,
                        "&:hover": {
                          backgroundColor: `${brand.primaryHover}`,
                        },
                      }}
                    />
                  </Stack>
                </Stack>
              </Stack>
            </Box>
          )}
        </Box>
      </Box>

      <SkipConfirmation
        open={showSkipConfirmation}
        onConfirm={confirmSkip}
        onCancel={cancelSkip}
      />
    </>
  );
};

export default OnboardingModal;
