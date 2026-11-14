import { useState, useEffect } from "react";
import { Box, Typography, IconButton, useTheme, keyframes } from "@mui/material";
import { X, Info, AlertCircle } from "lucide-react";
import { note, radiusPx } from "../../themes/palette";
import { isClassicUi } from "../../themes/uiStyle";

// Fade-out animation
const fadeOut = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-8px);
  }
`;

const classicUi = isClassicUi();

interface InfoBoxProps {
  message: string;
  storageKey: string; // Unique key for localStorage to track dismissal
  variant?: "info" | "warning"; // Icon type: info (green) or warning (yellow)
  header?: string; // Optional header for tips
  onDismiss?: () => void; // Optional custom dismiss handler
  disableInternalStorage?: boolean; // When true, skip internal localStorage management (use onDismiss instead)
  disableAnimation?: boolean; // When true, skip internal fade-out animation (parent handles it)
  backgroundColor?: string; // Optional custom background color
  borderColor?: string; // Optional custom border color
}

function InfoBox({
  message,
  storageKey,
  variant = "info",
  header,
  onDismiss,
  disableInternalStorage = false,
  disableAnimation = false,
  backgroundColor,
  borderColor,
}: InfoBoxProps) {
  const theme = useTheme();
  const [isVisible, setIsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  // Icon configuration based on variant
  const iconConfig = {
    info: {
      Icon: Info,
      color: theme.palette.success.main,
    },
    warning: {
      Icon: AlertCircle,
      color: theme.palette.warning.main,
    },
  };

  // Phase 1: explanations (info) use the amber note; warnings keep their look.
  const useNote = !classicUi && variant === "info";
  const { Icon } = iconConfig[variant];
  // The note's icon takes the note's own tone, not the green info colour.
  const color = useNote ? note.text : iconConfig[variant].color;

  // Check if this info box has been dismissed before (only if using internal storage)
  useEffect(() => {
    if (disableInternalStorage) return;

    const dismissed = localStorage.getItem(`infoBox_${storageKey}`);
    if (dismissed === "true") {
      setIsVisible(false);
    }
  }, [storageKey, disableInternalStorage]);

  const handleClose = () => {
    // If parent handles animation, call dismiss immediately
    if (disableAnimation) {
      if (onDismiss) {
        onDismiss();
      }
      return;
    }

    // Trigger fade-out animation
    setIsClosing(true);

    // Wait for animation to complete, then hide and cleanup
    setTimeout(() => {
      // Save dismissal to localStorage (only if using internal storage)
      if (!disableInternalStorage) {
        localStorage.setItem(`infoBox_${storageKey}`, "true");
      }
      setIsVisible(false);

      // Call custom dismiss handler if provided
      if (onDismiss) {
        onDismiss();
      }
    }, 300); // Match animation duration
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 13,
        color: useNote ? note.text : theme.palette.text.secondary,
        background: useNote ? note.bg : backgroundColor || theme.palette.background.paper,
        ...(useNote
          ? { padding: "10px 12px", borderRadius: radiusPx.sm }
          : { px: 4, py: 3.5, borderRadius: 0.5 }),
        border: `1px solid ${useNote ? note.border : borderColor || theme.palette.divider}`,
        gap: "8px",
        animation: !disableAnimation && isClosing ? `${fadeOut} 0.3s ease-out forwards` : "none",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px", flex: 1 }}>
        <Icon size={18} strokeWidth={2} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1px", flex: 1 }}>
          {header && (
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: useNote ? note.text : theme.palette.text.primary,
                lineHeight: 1.5,
              }}
            >
              {header}
            </Typography>
          )}
          <Typography
            sx={{
              fontSize: 13,
              color: useNote ? note.text : theme.palette.text.secondary,
              lineHeight: 1.5,
            }}
          >
            {message}
          </Typography>
        </Box>
      </Box>
      <IconButton
        onClick={handleClose}
        size="small"
        aria-label="Dismiss"
        sx={{
          "padding": "4px",
          "&:hover": {
            backgroundColor: theme.palette.action.hover,
          },
        }}
      >
        <X size={16} strokeWidth={2} />
      </IconButton>
    </Box>
  );
}

export default InfoBox;
