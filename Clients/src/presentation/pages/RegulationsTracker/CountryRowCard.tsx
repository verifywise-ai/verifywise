/**
 * @fileoverview Shared row card for the Regulations Tracker country list.
 *
 * Used by both the Browse and Tracked tabs to render a consistent country row:
 * globe icon, country name, region, and a configurable action button.
 * Browse also renders a checkbox (via the optional `checkbox` prop).
 *
 * @module pages/RegulationsTracker/CountryRowCard
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import { Globe } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { palette } from "../../themes/palette";

/** Shared interface for a catalogue country row. */
export interface CountryRow {
  slug: string;
  name: string;
  region?: string;
  iso2?: string;
  /** Unicode flag emoji from the feed (e.g. "🇪🇺"); falls back to a globe icon. */
  flag?: string;
  is_tracked?: boolean;
}

export interface CountryRowCardProps {
  row: CountryRow;
  /** Called when the row body (name/region area) is clicked. */
  onClick: () => void;
  /** Label for the action button (e.g. "Track", "Untrack"). */
  actionLabel: string;
  /** Variant for the action button. */
  actionVariant?: "outlined" | "contained" | "text";
  /** Called when the action button is clicked. */
  onAction: (e: React.MouseEvent) => void;
  /** Whether the action button should be shown as disabled. */
  actionDisabled?: boolean;
  /**
   * Optional checkbox element rendered at the leading edge of the row.
   * Browse uses this for the bulk-select checkbox; Tracked omits it.
   */
  checkbox?: React.ReactNode;
}

export function CountryRowCard({
  row,
  onClick,
  actionLabel,
  actionVariant = "outlined",
  onAction,
  actionDisabled = false,
  checkbox,
}: CountryRowCardProps) {
  return (
    <Box
      sx={{
        "display": "flex",
        "alignItems": "center",
        "gap": "12px",
        "border": `1px solid ${palette.border.dark}`,
        "borderRadius": "4px",
        "p": "10px 12px",
        "backgroundColor": palette.background.main,
        "cursor": "pointer",
        "&:hover": { backgroundColor: palette.background.accent },
      }}
      onClick={onClick}
    >
      {checkbox}

      {row.flag ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            fontSize: "18px",
            lineHeight: 1,
            flexShrink: 0,
            width: "20px",
            textAlign: "center",
          }}
        >
          {row.flag}
        </Box>
      ) : (
        <Globe size={16} strokeWidth={1.5} color={palette.text.tertiary} />
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: "14px", fontWeight: 500, color: palette.text.primary }}>
          {row.name}
        </Typography>
        {row.region && (
          <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
            {row.region}
          </Typography>
        )}
      </Box>

      <CustomizableButton
        text={actionLabel}
        variant={actionVariant}
        size="small"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onAction(e);
        }}
        isDisabled={actionDisabled}
        sx={{ flexShrink: 0 }}
      />
    </Box>
  );
}
