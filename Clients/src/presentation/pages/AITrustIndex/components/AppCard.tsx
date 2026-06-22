/**
 * @fileoverview AI Trust Index — shared app card.
 *
 * One app tile used by both Browse and Tracked. The card body (favicon, name,
 * dealbreaker flag, grade chip, summary, category, score) is common; the parts
 * that differ between pages are props:
 *   - `selectable` + `selected` + `onToggleSelect` — Browse's bulk-select checkbox
 *     (omitted on Tracked).
 *   - `statusChip` — Tracked's "Tracked" / "No longer in index" chip (omitted on Browse).
 *   - `actions` — page-specific footer control(s): Browse's Track/Untrack toggle,
 *     Tracked's Untrack button.
 *   - `dimmed` — Tracked dims apps removed from the index.
 *
 * Clicking the card body navigates to the detail page; the checkbox and any
 * action stop propagation so they don't trigger navigation.
 *
 * @module pages/AITrustIndex/components/AppCard
 */

import { ReactNode, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { AlertTriangle } from "lucide-react";
import Checkbox from "../../../components/Inputs/Checkbox";
import Chip from "../../../components/Chip";
import { palette } from "../../../themes/palette";
import { gradeVariant, categoryVariant, faviconUrl, TrustIndexRow } from "../shared";

interface AppCardProps {
  row: TrustIndexRow;
  /** Navigate to the app's detail page. */
  onOpen: (slug: string) => void;
  /** Footer control(s) — e.g. a Track/Untrack button. Stops its own propagation. */
  actions?: ReactNode;
  /** Show the bulk-select checkbox (Browse). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (slug: string) => void;
  /** Optional status chip shown in the footer (Tracked). */
  statusChip?: ReactNode;
  /** Dim the card (e.g. an app removed from the index). */
  dimmed?: boolean;
}

export default function AppCard({
  row,
  onOpen,
  actions,
  selectable = false,
  selected = false,
  onToggleSelect,
  statusChip,
  dimmed = false,
}: AppCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const detail = row.data;
  const grade = detail?.displayedGrade || row.letter_grade;
  const hasFlag = (detail?.dealbreakerFlags?.length ?? 0) > 0;
  const name = row.name || row.slug;
  const initial = (name || "?").charAt(0).toUpperCase();
  const domain = detail?.domain;

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row.slug);
        }
      }}
      sx={{
        "display": "flex",
        "flexDirection": "column",
        "border": `1px solid ${palette.border.dark}`,
        "borderRadius": "4px",
        "backgroundColor": palette.background.main,
        "p": "16px",
        "cursor": "pointer",
        "opacity": dimmed ? 0.6 : 1,
        "transition": "box-shadow 150ms ease, border-color 150ms ease",
        "&:hover": {
          boxShadow: "0 4px 20px rgba(16,24,40,0.08)",
          borderColor: palette.text.muted,
        },
      }}
    >
      {/* Header: (optional select) + favicon + name/vendor + grade */}
      <Stack direction="row" alignItems="flex-start" gap="8px">
        {selectable && (
          <Box
            component="span"
            onClick={(e) => e.stopPropagation()}
            sx={{ display: "flex", alignItems: "center", pt: "2px" }}
          >
            <Checkbox
              id={`ai-trust-index-card-select-${row.slug}`}
              size="small"
              value={row.slug}
              isChecked={selected}
              onChange={() => onToggleSelect?.(row.slug)}
              ariaLabel={`Select ${name}`}
              sx={{ p: 0 }}
            />
          </Box>
        )}

        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "8px",
            border: `1px solid ${palette.border.dark}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            backgroundColor: palette.background.accent,
            overflow: "hidden",
          }}
        >
          {domain && !imgFailed ? (
            <img
              src={faviconUrl(domain)}
              alt={name}
              width={20}
              height={20}
              onError={() => setImgFailed(true)}
              style={{ display: "block" }}
            />
          ) : (
            <Typography sx={{ fontSize: "15px", fontWeight: 600, color: palette.text.tertiary }}>
              {initial}
            </Typography>
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap="4px">
            <Typography
              sx={{
                fontSize: "14px",
                fontWeight: 600,
                color: palette.text.primary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </Typography>
            {hasFlag && (
              <AlertTriangle
                size={14}
                strokeWidth={1.5}
                color="#B23B3B"
                aria-label="Dealbreaker flag"
                style={{ flexShrink: 0 }}
              />
            )}
          </Stack>
          <Typography
            sx={{
              fontSize: "12px",
              color: palette.text.tertiary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.vendor && row.vendor !== name ? row.vendor : row.category || "—"}
          </Typography>
        </Box>

        {grade && <Chip label={grade} variant={gradeVariant(grade)} />}
      </Stack>

      {/* Summary — clamped to 4 lines */}
      {detail?.summary && (
        <Typography
          sx={{
            mt: "12px",
            fontSize: "13px",
            lineHeight: 1.5,
            color: palette.text.tertiary,
            flex: 1,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 4,
          }}
        >
          {detail.summary}
        </Typography>
      )}

      {/* Footer: category chip + score + status + actions */}
      <Stack direction="row" alignItems="center" gap="8px" sx={{ mt: "12px", flexWrap: "wrap" }}>
        {row.category && (
          <Chip label={row.category} variant={categoryVariant(row.category)} uppercase={false} />
        )}
        {row.score_out_of_100 != null && (
          <Typography sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.tertiary }}>
            {row.score_out_of_100}/100
          </Typography>
        )}
        {statusChip}
        <Box sx={{ flex: 1 }} />
        {actions && (
          <Box component="span" onClick={(e) => e.stopPropagation()}>
            {actions}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
