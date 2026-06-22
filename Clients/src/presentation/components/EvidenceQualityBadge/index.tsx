import { Box, Tooltip, Typography } from "@mui/material";
import { status, accent } from "../../themes/palette";

interface EvidenceQualityBadgeProps {
  score: number;
  size?: "small" | "medium";
  showLabel?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

function getScoreColor(score: number) {
  if (score >= 80) return status.success;
  if (score >= 60) return accent.primary;
  if (score >= 40) return status.warning;
  return status.error;
}

function getScoreLabel(score: number) {
  if (score >= 80) return "High";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

export default function EvidenceQualityBadge({
  score,
  size = "small",
  showLabel = true,
  onClick,
}: EvidenceQualityBadgeProps) {
  const colors = getScoreColor(score);
  const label = getScoreLabel(score);
  const isSmall = size === "small";
  const isClickable = typeof onClick === "function";

  return (
    <Tooltip
      title={
        isClickable
          ? `Click for details — ${score}/100 (${label})`
          : `Evidence Quality: ${score}/100 (${label})`
      }
      arrow
    >
      <Box
        onClick={(e) => {
          if (!isClickable) return;
          e.stopPropagation();
          onClick!(e);
        }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          backgroundColor: colors.bg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: isSmall ? "4px" : "6px",
          padding: isSmall ? "2px 6px" : "4px 10px",
          cursor: isClickable ? "pointer" : "default",
          transition: "all 120ms ease",
          ...(isClickable && {
            "&:hover": {
              filter: "brightness(0.97)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              transform: "translateY(-1px)",
            },
          }),
        }}
      >
        <Typography
          sx={{
            fontSize: isSmall ? 11 : 13,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {score}
        </Typography>
        {showLabel && (
          <Typography
            sx={{
              fontSize: isSmall ? 10 : 12,
              fontWeight: 500,
              lineHeight: 1.2,
              textTransform: "uppercase",
            }}
          >
            {label}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}
