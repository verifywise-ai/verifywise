/**
 * StepperModal - A modal with built-in stepper for multi-step forms
 *
 * Combines StandardModal's styling with Material-UI Stepper functionality.
 * Maintains the clean footer with division line and proper button positioning.
 *
 * @component
 * @example
 * ```tsx
 * const steps = ["Step 1", "Step 2", "Step 3"];
 *
 * <StepperModal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Create Configuration"
 *   steps={steps}
 *   activeStep={activeStep}
 *   onNext={handleNext}
 *   onBack={handleBack}
 *   onSubmit={handleSubmit}
 *   isSubmitting={loading}
 *   canProceed={isStepValid}
 * >
 *   {renderStepContent()}
 * </StepperModal>
 * ```
 */

import React, { useId } from "react";
import { Modal, Stack, Box, Typography, Step, Stepper, StepLabel } from "@mui/material";
import { background, border, text, radiusPx } from "../../../themes/palette";
import { X as CloseIcon } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";

interface StepperModalProps {
  /** Controls whether the modal is visible */
  isOpen: boolean;

  /** Callback function called when modal should close */
  onClose: () => void;

  /** Main title displayed in the header */
  title: string;

  /** Array of step labels */
  steps: string[];

  /** Current active step (0-indexed) */
  activeStep: number;

  /** Callback for moving to next step */
  onNext?: () => void;

  /** Callback for moving to previous step */
  onBack?: () => void;

  /** Callback for final submission (on last step) */
  onSubmit?: () => void;

  /** Current step content */
  children: React.ReactNode;

  /** When true, disables the action button */
  isSubmitting?: boolean;

  /** When true, enables the Next/Submit button (for validation) */
  canProceed?: boolean;

  /** Text for the final submit button (default: "Submit") */
  submitButtonText?: string;

  /** Maximum width of the modal (default: "900px") */
  maxWidth?: string;

  /** Optional badge to display next to the title (e.g., use case indicator) */
  headerBadge?: React.ReactNode;

  /** Optional control shown next to the close button (e.g., an activity toggle) */
  headerAction?: React.ReactNode;

  /** Fixed width; by default the modal fits its content, so it changes size between steps */
  width?: string;

  /** Keep the content area one height on every step so the buttons don't move */
  fixedHeight?: boolean;
}

const StepperModal: React.FC<StepperModalProps> = ({
  isOpen,
  onClose,
  title,
  steps,
  activeStep,
  onNext,
  onBack,
  onSubmit,
  children,
  isSubmitting = false,
  canProceed = true,
  submitButtonText = "Submit",
  maxWidth = "1000px",
  headerBadge,
  headerAction,
  width,
  fixedHeight = false,
}) => {
  const titleId = useId();
  const isLastStep = activeStep === steps.length - 1;
  const isFirstStep = activeStep === 0;

  const handleActionClick = () => {
    if (isLastStep && onSubmit) {
      onSubmit();
    } else if (onNext) {
      onNext();
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") {
          onClose();
        }
      }}
      sx={{ overflowY: "scroll" }}
    >
      <Stack
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        sx={{
          "position": "absolute",
          "top": "50%",
          "left": "50%",
          "transform": "translate(-50%, -50%)",
          "width": width ?? "fit-content",
          "minWidth": "600px",
          "maxWidth": maxWidth,
          "backgroundColor": "background.main",
          "borderRadius": "8px",
          "overflow": "hidden",
          "&:focus": {
            outline: "none",
          },
        }}
      >
        {/* Header Section */}
        <Stack
          sx={{
            background: "linear-gradient(180deg, #F8FAFB 0%, #F3F5F8 100%)",
            borderBottom: `1px solid ${border.light}`,
            padding: "16px 24px",
            paddingBottom: "36px",
            marginBottom: "-20px",
            zIndex: 0,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack spacing={0.5}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography
                  id={titleId}
                  sx={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: text.primary,
                    lineHeight: "28px",
                  }}
                >
                  {title}
                </Typography>
                {headerBadge}
              </Stack>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: "text.tertiary",
                  lineHeight: "20px",
                }}
              >
                <span>Step</span> {activeStep + 1} <span>of</span> {steps.length}
              </Typography>
            </Stack>

            <Stack direction="row" alignItems="center" gap="8px">
              {headerAction}
              <Box
                component="span"
                role="button"
                aria-label="Close"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClose();
                  }
                }}
                sx={{
                  "cursor": "pointer",
                  "color": "text.muted",
                  "display": "flex",
                  "alignItems": "center",
                  "padding": "4px",
                  "borderRadius": radiusPx.sm,
                  "&:hover": {
                    backgroundColor: background.surface,
                  },
                }}
              >
                <CloseIcon size={20} />
              </Box>
            </Stack>
          </Stack>
        </Stack>

        {/* Content Section */}
        <Box
          sx={{
            padding: "24px",
            flex: 1,
            overflow: "auto",
            // flex-basis would override a plain height, so a fixed height also opts out of flex
            ...(fixedHeight
              ? { flex: "none", height: "calc(90vh - 180px)", maxHeight: "calc(90vh - 180px)" }
              : { maxHeight: "calc(90vh - 180px)" }),
            border: `1px solid ${border.light}`,
            borderRadius: "16px",
            backgroundColor: "background.main",
            zIndex: 1,
            position: "relative",
          }}
        >
          {/* Stepper inside content */}
          <Box sx={{ mb: "24px" }}>
            <Stepper activeStep={activeStep}>
              {steps.map((label, index) => (
                <Step key={label}>
                  <StepLabel
                    sx={{
                      "& .MuiStepLabel-label": {
                        fontSize: "13px",
                        fontWeight: activeStep === index ? 600 : 400,
                      },
                      "& .MuiStepIcon-root": {
                        color: activeStep >= index ? "brand.primary" : border.light,
                      },
                      "& .MuiStepIcon-text": {
                        fill: "background.main",
                        fontSize: "12px",
                      },
                    }}
                  >
                    {label}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>

          {children}
        </Box>

        {/* Footer Section with Division Line - Compact */}
        <Stack
          direction="row"
          justifyContent="space-between"
          spacing={6}
          sx={{
            background: "linear-gradient(180deg, #F3F5F8 0%, #F8FAFB 100%)",
            borderTop: `1px solid ${border.light}`,
            padding: "12px 24px",
            paddingTop: "32px",
            marginTop: "-20px",
            zIndex: 0,
          }}
        >
          <CustomizableButton
            variant="outlined"
            text="Cancel"
            onClick={onClose}
            sx={{
              "minWidth": "70px",
              "height": "32px",
              "fontSize": "13px",
              "border": `1px solid ${border.dark}`,
              "color": "text.secondary",
              "&:hover": {
                backgroundColor: "background.accent",
                border: `1px solid ${border.dark}`,
              },
            }}
          />

          <Box sx={{ display: "flex", gap: 2 }}>
            {!isFirstStep && onBack && (
              <CustomizableButton
                variant="outlined"
                text="Back"
                onClick={onBack}
                sx={{
                  "minWidth": "70px",
                  "height": "32px",
                  "border": `1px solid ${border.dark}`,
                  "color": "text.secondary",
                  "fontSize": "13px",
                  "&:hover": {
                    backgroundColor: "background.accent",
                    border: `1px solid ${border.dark}`,
                  },
                }}
              />
            )}

            <CustomizableButton
              variant="contained"
              text={isLastStep ? submitButtonText : "Next"}
              onClick={handleActionClick}
              isDisabled={!canProceed || isSubmitting}
              loading={isSubmitting}
              sx={{
                "minWidth": "70px",
                "height": "32px",
                "fontSize": "13px",
                "backgroundColor": "brand.primary",
                "&:hover:not(.Mui-disabled)": {
                  backgroundColor: "brand.primaryHover",
                },
                "&.Mui-disabled": {
                  backgroundColor: "status.default.border",
                  color: "text.disabled",
                  cursor: "not-allowed",
                },
              }}
            />
          </Box>
        </Stack>
      </Stack>
    </Modal>
  );
};

export default StepperModal;
