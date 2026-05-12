import type { FC, ReactNode, MouseEvent, KeyboardEvent } from "react";
import { useState, useRef } from "react";
import { Box, Typography, Popover, IconButton, useTheme } from "@mui/material";
import { X } from "lucide-react";

interface EnhancedTooltipProps {
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
  /** Tooltip heading text */
  title: string;
  /** Rich content displayed in the tooltip body */
  content: ReactNode;
}

/**
 * Dark glassmorphic tooltip with rich content support.
 * Opens on hover, closes on mouse leave or explicit close button click.
 * Supports keyboard activation via Enter/Space on the trigger element.
 */
export const EnhancedTooltip: FC<EnhancedTooltipProps> = ({ children, title, content }) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setAnchorEl(event.currentTarget);
  };

  const handleKeyOpen = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setAnchorEl(event.currentTarget);
    }
  };

  const handlePopoverEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handlePopoverLeave = () => {
    setAnchorEl(null);
  };

  const handleCloseClick = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(null);
  };

  return (
    <>
      <Box
        onMouseEnter={handleOpen}
        onKeyDown={handleKeyOpen}
        tabIndex={0}
        role="button"
        aria-haspopup="true"
        sx={{ display: "inline-block" }}
      >
        {children}
      </Box>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handlePopoverLeave}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        disableRestoreFocus
        sx={{
          "pointerEvents": "auto",
          "& .MuiPopover-paper": {
            borderRadius: "4px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            maxWidth: "420px",
          },
        }}
        slotProps={{
          paper: {
            onMouseEnter: handlePopoverEnter,
            onMouseLeave: handlePopoverLeave,
          },
        }}
      >
        <Box
          sx={{
            background: "linear-gradient(135deg, #1f1f23 0%, #252530 100%)",
            p: 12,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <IconButton
            onClick={handleCloseClick}
            size="small"
            aria-label="Close tooltip"
            sx={{
              "position": "absolute",
              "top": 8,
              "right": 8,
              "color": "rgba(255, 255, 255, 0.6)",
              "&:hover": {
                color: theme.palette.common.white,
                backgroundColor: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            <X size={16} />
          </IconButton>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: "15px",
              color: theme.palette.common.white,
              letterSpacing: "-0.02em",
              mb: 2,
              pr: 3,
            }}
          >
            {title}
          </Typography>
          <Box
            sx={{
              height: "1px",
              background: "rgba(255, 255, 255, 0.1)",
              mb: 2,
            }}
          />
          <Box
            sx={{
              color: "rgba(255, 255, 255, 0.85)",
              fontSize: theme.typography.fontSize,
              lineHeight: 1.6,
            }}
          >
            {content}
          </Box>
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              bottom: -30,
              right: -30,
              width: 100,
              height: 100,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(19, 113, 91, 0.2) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
        </Box>
      </Popover>
    </>
  );
};
