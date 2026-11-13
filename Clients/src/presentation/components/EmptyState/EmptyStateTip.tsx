import { type FC, useRef, useState, useEffect, useCallback } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { accent as accentTokens, background, note, radiusPx } from "../../themes/palette";
import { isClassicUi } from "../../themes/uiStyle";

/** Three accent palettes that rotate per-tip */
const CLASSIC_ACCENT_PALETTES = [
  {
    bg: accentTokens.teal.bg,
    bgHover: accentTokens.teal.border,
    icon: accentTokens.teal.text,
    border: accentTokens.teal.border,
    expandBg: background.main,
  },
  {
    bg: accentTokens.blue.bg,
    bgHover: accentTokens.blue.border,
    icon: accentTokens.blue.text,
    border: accentTokens.blue.border,
    expandBg: background.main,
  },
  {
    bg: accentTokens.amber.bg,
    bgHover: accentTokens.amber.border,
    icon: accentTokens.amber.text,
    border: accentTokens.amber.border,
    expandBg: background.main,
  },
] as const;

/** Phase 1: every tip is an amber note, whatever its position. */
const NOTE_PALETTE = {
  bg: note.bg,
  bgHover: note.border,
  icon: note.text,
  border: note.border,
  expandBg: note.bg,
} as const;

const classicUi = isClassicUi();
const ACCENT_PALETTES = classicUi
  ? CLASSIC_ACCENT_PALETTES
  : ([NOTE_PALETTE, NOTE_PALETTE, NOTE_PALETTE] as const);

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
const EmptyStateTip: FC<EmptyStateTipProps> = ({ icon: Icon, title, description, accentIndex }) => {
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

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const details = detailsRef.current;
      if (!details) return;

      if (isOpen) {
        setIsOpen(false);
        setTimeout(() => {
          details.open = false;
        }, 200);
      } else {
        details.open = true;
        requestAnimationFrame(() => setIsOpen(true));
      }
    },
    [isOpen],
  );

  return (
    <Box
      component="details"
      ref={detailsRef}
      sx={{
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: radiusPx.md,
        overflow: "hidden",
        transition: "border-color 200ms ease",
      }}
    >
      <Box
        component="summary"
        onClick={handleToggle}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "gap": "10px",
          "padding": "10px 14px",
          "cursor": "pointer",
          "listStyle": "none",
          "userSelect": "none",
          "backgroundColor": theme.palette.background.main,
          "borderBottom": isOpen
            ? `1px solid ${theme.palette.border.light}`
            : "1px solid transparent",
          "transition": "background-color 150ms ease, border-color 200ms ease",
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
            backgroundColor: classicUi ? theme.palette.background.main : note.bg,
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              color: classicUi ? theme.palette.text.secondary : note.text,
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
