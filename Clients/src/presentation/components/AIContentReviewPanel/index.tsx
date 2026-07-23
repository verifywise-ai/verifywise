import { useState } from "react";
import { Box, Typography, Button, TextField, Stack } from "@mui/material";
import { Bot, Clock, Cpu, Wrench, Target, CheckCircle } from "lucide-react";
import {
  text as textColors,
  border as borderPalette,
  background,
  brand,
  accent,
} from "../../themes/palette";
import Chip from "../Chip";
import AIContentBadge from "../AIContentBadge";
import type { AIContentMetadata, ReviewAction } from "../../../domain/interfaces/i.aiContent";
import { displayFormattedDate, displayFormattedDateTime } from "../../tools/isoDateToString";

interface AIContentReviewPanelProps {
  item: AIContentMetadata;
  onReview: (id: number, action: ReviewAction, notes?: string) => void;
  isReviewing?: boolean;
}

function formatEntityType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AIContentReviewPanel({
  item,
  onReview,
  isReviewing,
}: AIContentReviewPanelProps) {
  const [notes, setNotes] = useState("");

  const createdDate = item.created_at ? displayFormattedDateTime(item.created_at) : "";

  return (
    <Box
      sx={{
        borderRadius: "8px",
        border: `1px solid ${borderPalette.dark}`,
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 3.5,
          py: 2,
          backgroundColor: background.accent,
          borderBottom: `1px solid ${borderPalette.light}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 600,
              color: textColors.primary,
              fontFamily: "'Red Hat Display', 'Geist', sans-serif",
            }}
          >
            {formatEntityType(item.entity_type)}
            <Box
              component="span"
              sx={{ color: textColors.muted, fontWeight: 400, ml: 0.75, fontSize: 14 }}
            >
              #{item.entity_id}
            </Box>
          </Typography>
          {item.field_name && (
            <Chip label={item.field_name} size="small" variant="default" uppercase={false} />
          )}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1.5}>
          {createdDate && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Clock size={13} style={{ color: textColors.muted }} />
              <Typography sx={{ fontSize: 12, color: textColors.muted }}>{createdDate}</Typography>
            </Stack>
          )}
          <AIContentBadge
            badgeType={item.badge_type}
            modelUsed={item.model_used}
            confidenceScore={item.confidence_score}
            humanReviewed={item.human_reviewed}
            reviewAction={item.review_action}
            variant="inline"
            size="medium"
          />
        </Stack>
      </Box>

      {/* ── Body ── */}
      <Box sx={{ px: 3.5, py: 3 }}>
        {/* Metadata tags */}
        <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: "wrap", rowGap: "12px" }}>
          {item.model_used && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                backgroundColor: accent.primary.bg,
                border: `1px solid ${accent.primary.border}`,
                borderRadius: "8px",
                px: 2,
                py: 0.75,
              }}
            >
              <Cpu size={14} style={{ color: accent.primary.text }} />
              <Typography sx={{ fontSize: 12, color: accent.primary.text, fontWeight: 500 }}>
                {item.model_used}
              </Typography>
            </Stack>
          )}
          {item.model_provider && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                backgroundColor: accent.primary.bg,
                border: `1px solid ${accent.primary.border}`,
                borderRadius: "8px",
                px: 2,
                py: 0.75,
              }}
            >
              <Bot size={14} style={{ color: accent.primary.text }} />
              <Typography sx={{ fontSize: 12, color: accent.primary.text, fontWeight: 500 }}>
                {item.model_provider}
              </Typography>
            </Stack>
          )}
          {item.tool_name && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                backgroundColor: accent.primary.bg,
                border: `1px solid ${accent.primary.border}`,
                borderRadius: "8px",
                px: 2,
                py: 0.75,
              }}
            >
              <Wrench size={14} style={{ color: accent.primary.text }} />
              <Typography sx={{ fontSize: 12, color: accent.primary.text, fontWeight: 500 }}>
                {item.tool_name}
              </Typography>
            </Stack>
          )}
          {item.confidence_score !== null && item.confidence_score !== undefined && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                backgroundColor: accent.primary.bg,
                border: `1px solid ${accent.primary.border}`,
                borderRadius: "8px",
                px: 2,
                py: 0.75,
              }}
            >
              <Target size={14} style={{ color: accent.primary.text }} />
              <Typography sx={{ fontSize: 12, color: accent.primary.text, fontWeight: 600 }}>
                {item.confidence_score}%
              </Typography>
            </Stack>
          )}
        </Stack>

        {/* Prompt summary */}
        {item.prompt_summary && (
          <Box
            sx={{
              mb: 1,
              px: 2.5,
              py: 2,
              backgroundColor: background.accent,
              borderRadius: "8px",
              borderLeft: `4px solid ${brand.primary}`,
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                color: textColors.tertiary,
                lineHeight: 1.7,
                letterSpacing: "0.01em",
              }}
            >
              {item.prompt_summary}
            </Typography>
          </Box>
        )}

        {/* Already reviewed */}
        {item.human_reviewed && item.review_action && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              px: 2,
              py: 1.5,
              backgroundColor: accent.primary.bg,
              borderRadius: "8px",
              border: `1px solid ${accent.primary.border}`,
            }}
          >
            <CheckCircle size={16} style={{ color: accent.primary.text }} />
            <Typography sx={{ fontSize: 13, color: accent.primary.text, fontWeight: 500 }}>
              {item.review_action.charAt(0).toUpperCase() + item.review_action.slice(1)}
              {item.reviewed_at && ` on ${displayFormattedDate(item.reviewed_at)}`}
            </Typography>
          </Stack>
        )}

        {/* Review actions */}
        {!item.human_reviewed && (
          <Box>
            <TextField
              placeholder="Add review notes (optional)..."
              size="small"
              fullWidth
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              sx={{
                "mb": 1,
                "& .MuiInputBase-root": { fontSize: 13 },
                "& .MuiInputBase-input": { py: 1.5, lineHeight: 1.6 },
                "& .MuiOutlinedInput-root": {
                  "borderRadius": "8px",
                  "& fieldset": { borderColor: borderPalette.light },
                  "&:hover fieldset": { borderColor: borderPalette.dark },
                  "&.Mui-focused fieldset": { borderColor: brand.primary },
                },
              }}
            />
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                disabled={isReviewing}
                onClick={() => onReview(item.id, "approved", notes || undefined)}
                sx={{
                  "textTransform": "none",
                  "fontSize": 13,
                  "fontWeight": 600,
                  "borderRadius": "8px",
                  "backgroundColor": brand.primary,
                  "boxShadow": "none",
                  "px": 3.5,
                  "py": 1,
                  "&:hover": { backgroundColor: brand.primaryHover, boxShadow: "none" },
                }}
              >
                Approve
              </Button>
              <Button
                variant="outlined"
                disabled={isReviewing}
                onClick={() => onReview(item.id, "modified", notes || undefined)}
                sx={{
                  "textTransform": "none",
                  "fontSize": 13,
                  "fontWeight": 500,
                  "borderRadius": "8px",
                  "borderColor": borderPalette.dark,
                  "color": textColors.secondary,
                  "px": 3.5,
                  "py": 1,
                  "&:hover": { backgroundColor: background.hover, borderColor: borderPalette.dark },
                }}
              >
                Modified
              </Button>
              <Button
                variant="outlined"
                disabled={isReviewing}
                onClick={() => onReview(item.id, "rejected", notes || undefined)}
                sx={{
                  "textTransform": "none",
                  "fontSize": 13,
                  "fontWeight": 500,
                  "borderRadius": "8px",
                  "borderColor": borderPalette.dark,
                  "color": textColors.secondary,
                  "px": 3.5,
                  "py": 1,
                  "&:hover": { backgroundColor: background.hover, borderColor: borderPalette.dark },
                }}
              >
                Reject
              </Button>
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
}
