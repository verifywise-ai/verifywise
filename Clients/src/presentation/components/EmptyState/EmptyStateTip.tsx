import { type FC, useRef, useState, useEffect, useCallback } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

/** Three accent palettes that rotate per-tip */
const ACCENT_PALETTES = [
  { bg: "#ECFDF3", bgHover: "#D1FADF", icon: "#039855", border: "#A6F4C5", expandBg: "#F6FEF9" },
  { bg: "#EFF8FF", bgHover: "#D1E9FF", icon: "#1570EF", border: "#84CAFF", expandBg: "#F5FAFF" },
  { bg: "#FFFAEB", bgHover: "#FEF0C7", icon: "#DC6803", border: "#FEDF89", expandBg: "#FFFCF5" },
] as const;

interface EmptyStateTipProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Accent index (0=green, 1=blue, 2=amber). Auto-assigned when omitted. */
  accentIndex?: number;
}

/** Global counter so sibling tips cycle through accents automatically */
let tipMountCounter = 0;

/**
 * Collapsible tip block for empty states.
 * Uses native <details> with animated height transition and colored accents.
 */
const EmptyStateTip: FC<EmptyStateTipProps> = ({
  icon: Icon,
  title,
  description,
  accentIndex,
}) => {
  const theme = useTheme();
  const contentRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [myAccent] = useState(() => {
    if (accentIndex !== undefined) return accentIndex % ACCENT_PALETTES.length;
    return tipMountCounter++ % ACCENT_PALETTES.length;
  });

  const accent = ACCENT_PALETTES[myAccent];

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [description]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const details = detailsRef.current;
    if (!details) return;

    if (isOpen) {
      setIsOpen(false);
      setTimeout(() => { details.open = false; }, 200);
    } else {
      details.open = true;
      requestAnimationFrame(() => setIsOpen(true));
    }
  }, [isOpen]);

  return (
    <Box
      component="details"
      ref={detailsRef}
      sx={{
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "6px",
        overflow: "hidden",
        transition: "border-color 200ms ease",
      }}
    >
      <Box
        component="summary"
        onClick={handleToggle}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          cursor: "pointer",
          listStyle: "none",
          userSelect: "none",
          backgroundColor: theme.palette.background.main,
          borderBottom: isOpen
            ? `1px solid ${theme.palette.border.light}`
            : "1px solid transparent",
          transition: "background-color 150ms ease, border-color 200ms ease",
          "&:hover": {
            backgroundColor: theme.palette.background.fill,
          },
          "&::-webkit-details-marker": { display: "none" },
          "&::marker": { display: "none" },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: "6px",
            backgroundColor: accent.bg,
            border: `1px solid ${accent.border}40`,
            flexShrink: 0,
            transition: "background-color 200ms ease, border-color 200ms ease",
          }}
        >
          <Icon size={14} color={accent.icon} />
        </Box>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.palette.text.primary,
            flex: 1,
          }}
        >
          {title}
        </Typography>
        <ChevronRight
          size={14}
          color={theme.palette.text.tertiary}
          style={{
            transition: "transform 200ms ease",
            flexShrink: 0,
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </Box>
      <Box
        sx={{
          height: isOpen ? contentHeight : 0,
          opacity: isOpen ? 1 : 0,
          overflow: "hidden",
          transition: "height 200ms ease, opacity 200ms ease",
        }}
      >
        <Box
          ref={contentRef}
          sx={{
            padding: "12px 14px 12px 54px",
            backgroundColor: theme.palette.background.main,
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              color: theme.palette.text.secondary,
              lineHeight: 1.6,
            }}
          >
            {description}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default EmptyStateTip;
