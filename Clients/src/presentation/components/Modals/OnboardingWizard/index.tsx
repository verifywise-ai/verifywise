/**
 * OnboardingWizard — Reusable multi-step onboarding modal.
 *
 * Dark slate header with green-accent segmented-bar step indicators + light body.
 * The content area for each step accepts any ReactNode, so consumers can
 * embed forms, images, or any custom UI widgets.
 *
 * @example
 * ```tsx
 * <OnboardingWizard
 *   isOpen={open}
 *   onClose={() => setOpen(false)}
 *   title="Set up AI Detection"
 *   subtitle="3 quick steps to monitor AI tool usage"
 *   steps={[
 *     { label: "Connect", content: <ConnectForm /> },
 *     { label: "Alert",   content: <AlertConfig /> },
 *     { label: "Monitor", content: <MonitorInfo /> },
 *   ]}
 * />
 * ```
 */

import React, { useCallback, useEffect, useState } from "react";
import { Box, Modal, Stack, Typography } from "@mui/material";
import { LucideIcon, Shield, Check, X } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";

const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark-mode")
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark-mode"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

export interface OnboardingWizardStep {
  /** Label shown in the segmented bar */
  label: string;
  /** Any React content rendered in the body when this step is active */
  content: React.ReactNode;
}

export interface OnboardingWizardProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Called when the modal should close (X, Skip, or final action) */
  onClose: () => void;

  /** Main heading in the dark header */
  title: string;
  /** Secondary text below the title */
  subtitle?: string;
  /** Small uppercase badge text (top-left, green) */
  badgeText?: string;
  /** Icon next to the badge text (defaults to Shield) */
  badgeIcon?: LucideIcon;

  /** Ordered list of steps — each with a bar label and body content */
  steps: OnboardingWizardStep[];

  /** Text on the primary button at the last step (default: "Get started") */
  finishButtonText?: string;
  /** Text on the secondary button at step 0 (default: "Skip") */
  skipButtonText?: string;
  /** Called when the user clicks the finish button on the last step.
   *  If not provided, onClose is called. */
  onFinish?: () => void;

  /** Modal width in px (default: 620) */
  width?: number;

  /** When set, the wizard stores a "completed" flag in localStorage under this
   *  key. On subsequent renders the modal auto-hides (won't open at all).
   *  Pass `undefined` to disable persistence. */
  storageKey?: string;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badgeText = "Getting started",
  badgeIcon: BadgeIcon = Shield,
  steps,
  finishButtonText = "Get started",
  skipButtonText = "Skip",
  onFinish,
  width = 620,
  storageKey,
}) => {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const isLast = step === steps.length - 1;
  const isDark = useIsDarkMode();

  // Check localStorage on mount
  useEffect(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored === "true") {
          setDismissed(true);
        }
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [storageKey]);

  const markDismissed = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, "true");
      } catch {
        // localStorage may be unavailable
      }
      setDismissed(true);
    }
  }, [storageKey]);

  const handleClose = () => {
    setStep(0);
    markDismissed();
    onClose();
  };

  const handleFinish = () => {
    setStep(0);
    markDismissed();
    if (onFinish) {
      onFinish();
    } else {
      onClose();
    }
  };

  // If already dismissed via localStorage, never render
  if (dismissed) return null;

  return (
    <Modal
      open={isOpen}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") {
          handleClose();
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Stack
        className="onboarding-wizard"
        sx={{
          width,
          borderRadius: "12px",
          overflow: "hidden",
          outline: "none",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        {/* ── Dark header ── */}
        <Box
          sx={{
            background: isDark
              ? "linear-gradient(135deg, #e0e0e0 0%, #d2d2d2 100%)"
              : "linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%)",
            padding: "32px 32px 28px",
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
          >
            <Stack spacing={0}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <BadgeIcon size={18} color={isDark ? "#b52180" : "#4ADE80"} strokeWidth={2} />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isDark ? "#b52180" : "#4ADE80",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                  }}
                >
                  {badgeText}
                </Typography>
              </Stack>

              <Box sx={{ height: "16px" }} />

              <Typography
                sx={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: isDark ? "text.black" : "background.main",
                  lineHeight: 1.3,
                }}
              >
                {title}
              </Typography>
              {subtitle && (
                <Typography
                  sx={{
                    fontSize: 13,
                    color: isDark ? "#6b5c47" : "#94A3B8",
                    lineHeight: 1.5,
                    mt: 0.5,
                  }}
                >
                  {subtitle}
                </Typography>
              )}
            </Stack>

            <Box
              component="span"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClose();
                }
              }}
              sx={{
                cursor: "pointer",
                color: isDark ? "#9b8b74" : "#64748B",
                display: "flex",
                alignItems: "center",
                padding: "4px",
                borderRadius: "4px",
                "&:hover": {
                  color: isDark ? "#6b5c47" : "#94A3B8",
                  bgcolor: isDark ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)",
                },
              }}
            >
              <X size={18} />
            </Box>
          </Stack>

          <Box sx={{ height: "16px" }} />

          {/* Step indicators — segmented bar */}
          <Box
            sx={{
              display: "flex",
              borderRadius: "10px",
              overflow: "hidden",
              border: isDark ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {steps.map((s, i) => {
              const isActive = i === step;
              const isDone = i < step;
              return (
                <Box
                  key={i}
                  onClick={() => setStep(i)}
                  sx={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    height: 40,
                    cursor: "pointer",
                    bgcolor: isActive
                      ? isDark ? "rgba(181,33,128,0.12)" : "rgba(74,222,128,0.12)"
                      : isDone
                      ? isDark ? "rgba(181,33,128,0.05)" : "rgba(74,222,128,0.05)"
                      : "transparent",
                    borderRight:
                      i < steps.length - 1
                        ? isDark ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)"
                        : "none",
                    transition: "background-color 0.2s",
                    "&:hover": {
                      bgcolor: isActive
                        ? isDark ? "rgba(181,33,128,0.12)" : "rgba(74,222,128,0.12)"
                        : isDark ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
                    },
                  }}
                >
                  {isDone && (
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        bgcolor: isDark ? "#b52180" : "#4ADE80",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Check size={10} color={isDark ? "#e0e0e0" : "#1a1f2e"} strokeWidth={3} />
                    </Box>
                  )}
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: isActive ? 600 : isDone ? 500 : 400,
                      color: isDone
                        ? isDark ? "#b52180" : "#4ADE80"
                        : isActive
                        ? isDark ? "text.black" : "background.main"
                        : isDark ? "#6b5c47" : "#94A3B8",
                    }}
                  >
                    {s.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* ── Light body — renders step content (any ReactNode) ── */}
        <Box sx={{ bgcolor: "background.main", padding: "32px" }}>
          {steps[step]?.content}
        </Box>

        {/* ── Footer ── */}
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{
            bgcolor: "#FAFBFC",
            borderTop: "1px solid #E0E4E9",
            padding: "14px 32px",
          }}
        >
          <CustomizableButton
            variant="outlined"
            text={step === 0 ? skipButtonText : "Back"}
            onClick={() => (step === 0 ? handleClose() : setStep(step - 1))}
            sx={{
              minWidth: "70px",
              height: 34,
              fontSize: 13,
              border: "1px solid #d0d5dd",
              color: "text.secondary",
              "&:hover": {
                bgcolor: "background.accent",
                border: "1px solid #d0d5dd",
              },
            }}
          />
          <CustomizableButton
            variant="contained"
            text={isLast ? finishButtonText : "Continue"}
            onClick={() => (isLast ? handleFinish() : setStep(step + 1))}
            sx={{
              minWidth: "70px",
              height: 34,
              fontSize: 13,
              bgcolor: "brand.primary",
              "&:hover": {
                bgcolor: "brand.primaryHover",
              },
            }}
          />
        </Stack>
      </Stack>
    </Modal>
  );
};

export default OnboardingWizard;
