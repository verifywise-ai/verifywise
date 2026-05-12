import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  IconButton,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  Slide,
} from "@mui/material";
import { X as CloseIcon } from "lucide-react";
import { useSmartPromptContext } from "../../../application/contexts/SmartPrompt.context";
import { palette } from "../../themes/palette";
import { useAuth } from "../../../application/hooks/useAuth";
import "./index.css";

const AUTO_DISMISS_MS = 10000;

const SmartPrompt: React.FC = () => {
  const { activePrompt, dismissPrompt, setDontAskAgain } = useSmartPromptContext();
  const { userRoleName } = useAuth();
  const [checkedDontAsk, setCheckedDontAsk] = useState(false);
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = userRoleName === "Admin";

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleDismiss = useCallback(
    (id: string) => {
      clearTimers();
      if (activePrompt?.dontAskAgainKey && checkedDontAsk) {
        setDontAskAgain(activePrompt.dontAskAgainKey, true);
        activePrompt.onDontAskAgain?.(activePrompt.dontAskAgainKey);
      }
      setVisible(false);
      // wait for exit animation
      setTimeout(() => {
        dismissPrompt(id);
        setCheckedDontAsk(false);
        setProgress(100);
      }, 200);
    },
    [clearTimers, dismissPrompt, activePrompt, checkedDontAsk, setDontAskAgain],
  );

  useEffect(() => {
    if (!activePrompt) return;

    setVisible(true);
    setCheckedDontAsk(false);
    setProgress(100);

    const totalMs = activePrompt.autoDismissMs ?? AUTO_DISMISS_MS;
    const intervalMs = 100;
    const steps = totalMs / intervalMs;
    let currentStep = 0;

    timerRef.current = setInterval(() => {
      currentStep++;
      const pct = Math.max(0, 100 - (currentStep / steps) * 100);
      setProgress(pct);
      if (currentStep >= steps) {
        clearTimers();
        handleDismiss(activePrompt.id);
      }
    }, intervalMs);

    return () => {
      clearTimers();
    };
  }, [activePrompt, clearTimers, handleDismiss]);

  if (!activePrompt) return null;

  const handlePrimaryClick = () => {
    activePrompt.primaryAction?.onClick?.();
    handleDismiss(activePrompt.id);
  };

  const handleSecondaryClick = () => {
    activePrompt.secondaryAction?.onClick?.();
    handleDismiss(activePrompt.id);
  };

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Paper
        elevation={6}
        className="smart-prompt"
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 360,
          maxWidth: "calc(100vw - 48px)",
          zIndex: 9998,
          borderRadius: 3,
          overflow: "hidden",
          border: `1px solid ${palette.border.light}`,
          backgroundColor: palette.background.main,
        }}
      >
        {/* Progress bar */}
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            "height": 3,
            "backgroundColor": palette.border.light,
            "& .MuiLinearProgress-bar": {
              backgroundColor: palette.brand.primary,
            },
          }}
        />

        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                fontSize: 15,
                color: palette.text.primary,
                lineHeight: 1.4,
                pr: 3,
              }}
            >
              {activePrompt.title}
            </Typography>
            <IconButton
              size="small"
              onClick={() => handleDismiss(activePrompt.id)}
              sx={{
                "color": palette.text.muted,
                "p": 0.5,
                "mt": -0.5,
                "mr": -0.5,
                "&:hover": { color: palette.text.primary },
              }}
              aria-label="Dismiss prompt"
            >
              <CloseIcon size={16} />
            </IconButton>
          </Stack>

          <Typography
            variant="body2"
            sx={{
              mt: 1,
              color: palette.text.tertiary,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {activePrompt.message}
          </Typography>

          {/* Actions */}
          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
            {activePrompt.primaryAction && (
              <Button
                variant="contained"
                size="small"
                onClick={handlePrimaryClick}
                disabled={!isAdmin && activePrompt.type === "governance-os-enable"}
                sx={{
                  "textTransform": "none",
                  "fontWeight": 500,
                  "fontSize": 13,
                  "borderRadius": 2,
                  "boxShadow": "none",
                  "backgroundColor": palette.brand.primary,
                  "&:hover": {
                    backgroundColor: palette.brand.primaryHover,
                    boxShadow: "none",
                  },
                }}
                title={
                  !isAdmin && activePrompt.type === "governance-os-enable"
                    ? "Contact your admin to enable Governance OS"
                    : undefined
                }
              >
                {activePrompt.primaryAction.label}
              </Button>
            )}
            {activePrompt.secondaryAction && (
              <Button
                variant="outlined"
                size="small"
                onClick={handleSecondaryClick}
                sx={{
                  "textTransform": "none",
                  "fontWeight": 500,
                  "fontSize": 13,
                  "borderRadius": 2,
                  "borderColor": palette.border.dark,
                  "color": palette.text.secondary,
                  "&:hover": {
                    borderColor: palette.text.tertiary,
                    backgroundColor: palette.background.hover,
                  },
                }}
              >
                {activePrompt.secondaryAction.label}
              </Button>
            )}
          </Stack>

          {/* Don't ask again */}
          {activePrompt.dontAskAgainKey && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={checkedDontAsk}
                  onChange={(e) => setCheckedDontAsk(e.target.checked)}
                  sx={{
                    "color": palette.text.muted,
                    "&.Mui-checked": { color: palette.brand.primary },
                    "p": 0.5,
                  }}
                />
              }
              label="Don't ask me again"
              sx={{
                "mt": 1.5,
                "ml": -0.5,
                "& .MuiFormControlLabel-label": {
                  fontSize: 12,
                  color: palette.text.muted,
                },
              }}
            />
          )}
        </Box>
      </Paper>
    </Slide>
  );
};

export default SmartPrompt;
