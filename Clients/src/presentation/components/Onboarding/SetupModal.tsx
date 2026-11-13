/**
 * SetupModal - A simple modal shown to the org creator on their first login
 *
 * This modal offers two choices:
 * - Add demo data (helpful for navigation)
 * - Start with a blank dashboard
 *
 * The modal is only shown when:
 * 1. User is the org creator (first admin)
 * 2. Organization onboarding_status is 'pending'
 * 3. User is on the dashboard route
 */

import React, { useRef, useState } from "react";
import { Box, Stack, Typography, CircularProgress, alpha } from "@mui/material";
import { Database, LayoutDashboard } from "lucide-react";
import { useDispatch } from "react-redux";
import { CustomizableButton } from "../button/customizable-button";
import { postAutoDrivers } from "../../../application/repository/entity.repository";
import { updateOnboardingStatus } from "../../../application/repository/organization.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import { setOnboardingStatus } from "../../../application/redux/auth/authSlice";
import { brand, text, background, border, accent, radiusPx } from "../../themes/palette";

const SETUP_ERROR_MESSAGE =
  "Something went wrong while setting up your workspace. Try again, or skip for now.";

interface SetupModalProps {
  /** Callback when setup is complete (either option selected) */
  onComplete: () => void;
  /** Callback when user skips/dismisses (treated as "start blank") */
  onSkip: () => void;
}

const SetupModal: React.FC<SetupModalProps> = ({ onComplete, onSkip }) => {
  const { organizationId } = useAuth();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingOption, setLoadingOption] = useState<"demo" | "blank" | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set once the demo data call succeeds, so a retry after a failed status
  // save does not send it again.
  const demoInserted = useRef(false);

  const finish = (onDone: () => void) => {
    // Update Redux state so it persists after reload
    dispatch(setOnboardingStatus("completed"));
    setIsClosing(true);
    setTimeout(onDone, 300);
  };

  /**
   * Runs one setup choice, saves the onboarding status and closes the modal.
   * If anything fails, the modal stays open and shows an error so the user can
   * retry or skip.
   */
  const runChoice = async (
    option: "demo" | "blank",
    work: () => Promise<void>,
    onDone: () => void,
  ) => {
    if (isLoading) return;

    setIsLoading(true);
    setLoadingOption(option);
    setErrorMessage(null);

    try {
      await work();
      if (organizationId) {
        await updateOnboardingStatus(organizationId);
      }
      finish(onDone);
    } catch (error) {
      console.error("Error completing setup:", error);
      setIsLoading(false);
      setLoadingOption(null);
      setErrorMessage(SETUP_ERROR_MESSAGE);
    }
  };

  // "Skip for now" always closes, even when the status cannot be saved, so a
  // failing save never traps the user behind the modal. The server then still
  // says "pending", so the modal can come back on a later sign-in.
  const handleClose = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setLoadingOption("blank");
    setErrorMessage(null);

    try {
      if (organizationId) {
        await updateOnboardingStatus(organizationId);
      }
    } catch (error) {
      console.error("Could not save onboarding status on skip:", error);
    }
    finish(onSkip);
  };

  const handleSelectDemo = () =>
    runChoice(
      "demo",
      async () => {
        if (!demoInserted.current) {
          await postAutoDrivers();
          demoInserted.current = true;
        }
      },
      () => {
        onComplete();
        // Reload the page to show the newly created demo data
        window.location.reload();
      },
    );

  const handleSelectBlank = () => runChoice("blank", async () => {}, onComplete);

  return (
    <Box
      className="confirmation-backdrop"
      sx={{
        "position": "fixed",
        "top": 0,
        "left": 0,
        "right": 0,
        "bottom": 0,
        "backgroundColor": "rgba(0, 0, 0, 0.4)",
        "backdropFilter": "blur(2px)",
        "display": "flex",
        "alignItems": "center",
        "justifyContent": "center",
        "zIndex": 9999,
        "padding": 2,
        "animation": isClosing ? "fadeOut 0.3s ease-out" : "fadeIn 0.3s ease-in",
        "@keyframes fadeOut": {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
        "@keyframes fadeIn": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
      onClick={(e) => {
        // Only close on backdrop click, not on modal content click
        if (e.target === e.currentTarget && !isLoading) {
          handleClose();
        }
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        sx={{
          backgroundColor: background.main,
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)",
          width: "100%",
          maxWidth: "520px",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Stack
          sx={{
            padding: "32px 32px 24px",
            textAlign: "center",
          }}
        >
          <Typography
            sx={{
              fontSize: 22,
              fontWeight: 600,
              color: text.primary,
              marginBottom: "8px",
            }}
          >
            Welcome to VerifyWise
          </Typography>
          <Typography
            sx={{
              fontSize: 14,
              color: `${text.tertiary}`,
              lineHeight: 1.5,
            }}
          >
            How would you like to get started? You can explore with sample data or begin with a
            clean slate.
          </Typography>
        </Stack>

        {/* Options */}
        <Stack
          direction="row"
          spacing={4}
          sx={{
            padding: "0 32px 32px",
          }}
        >
          {/* Demo Data Option */}
          <Box
            onClick={handleSelectDemo}
            sx={{
              "flex": 1,
              "padding": "24px 20px",
              "border": `1px solid ${border.light}`,
              "borderRadius": radiusPx.sm,
              "cursor": isLoading ? "not-allowed" : "pointer",
              "opacity": isLoading && loadingOption !== "demo" ? 0.5 : 1,
              "transition": "all 0.2s ease",
              "&:hover": {
                borderColor: isLoading ? border.light : `${brand.primary}`,
                backgroundColor: isLoading ? "transparent" : alpha(brand.primary, 0.03),
              },
            }}
          >
            <Stack alignItems="center" spacing={2}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: radiusPx.lg,
                  backgroundColor: background.fill,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {loadingOption === "demo" ? (
                  <CircularProgress size={24} sx={{ color: `${brand.primary}` }} />
                ) : (
                  <Database size={24} color={brand.primary} />
                )}
              </Box>
              <Stack spacing={0.5} alignItems="center">
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: text.primary,
                  }}
                >
                  Add demo data
                </Typography>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: `${text.tertiary}`,
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}
                >
                  Explore with sample projects and controls
                </Typography>
              </Stack>
            </Stack>
          </Box>

          {/* Blank Dashboard Option */}
          <Box
            onClick={handleSelectBlank}
            sx={{
              "flex": 1,
              "padding": "24px 20px",
              "border": `1px solid ${border.light}`,
              "borderRadius": radiusPx.sm,
              "cursor": isLoading ? "not-allowed" : "pointer",
              "opacity": isLoading && loadingOption !== "blank" ? 0.5 : 1,
              "transition": "all 0.2s ease",
              "&:hover": {
                borderColor: isLoading ? border.light : `${brand.primary}`,
                backgroundColor: isLoading ? "transparent" : alpha(brand.primary, 0.03),
              },
            }}
          >
            <Stack alignItems="center" spacing={2}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: radiusPx.lg,
                  backgroundColor: background.surface,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {loadingOption === "blank" ? (
                  <CircularProgress size={24} sx={{ color: `${text.tertiary}` }} />
                ) : (
                  <LayoutDashboard size={24} color={text.tertiary} />
                )}
              </Box>
              <Stack spacing={0.5} alignItems="center">
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: text.primary,
                  }}
                >
                  Start blank
                </Typography>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: `${text.tertiary}`,
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}
                >
                  Begin with a clean dashboard
                </Typography>
              </Stack>
            </Stack>
          </Box>
        </Stack>

        {errorMessage && (
          <Box
            role="alert"
            sx={{
              margin: "-16px 32px 24px",
              padding: "10px 12px",
              borderRadius: radiusPx.sm,
              border: `1px solid ${accent.red.border}`,
              backgroundColor: accent.red.bg,
            }}
          >
            <Typography sx={{ fontSize: 13, color: accent.red.text, lineHeight: 1.5 }}>
              {errorMessage}
            </Typography>
          </Box>
        )}

        {/* Footer */}
        <Box
          sx={{
            padding: "16px 32px",
            borderTop: `1px solid ${border.light}`,
            backgroundColor: `${background.accent}`,
          }}
        >
          <Stack direction="row" justifyContent="flex-end">
            <CustomizableButton
              variant="text"
              text="Skip for now"
              onClick={handleClose}
              isDisabled={isLoading}
              sx={{
                "color": `${text.tertiary}`,
                "fontSize": 13,
                "&:hover": {
                  backgroundColor: "transparent",
                  color: text.primary,
                },
              }}
            />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default SetupModal;
