import { Box, Tooltip, Typography } from "@mui/material";
import { status } from "../../themes/palette";

export type QualityGrade = "A" | "B" | "C" | "D" | "F";

interface EvidenceQualityBadgeProps {
  grade: QualityGrade | null;
  size?: "small" | "medium";
  showLabel?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function getGradeColor(grade: QualityGrade | null) {
  switch (grade) {
    case "A":
      return status.success;
    case "B":
      return status.info;
    case "C":
      return status.warning;
    case "D":
      return status.default;
    case "F":
      return status.error;
    default:
      return status.default;
  }
}

export function getGradeLabel(grade: QualityGrade | null) {
  switch (grade) {
    case "A":
      return "Excellent";
    case "B":
      return "Good";
    case "C":
      return "Adequate";
    case "D":
      return "Weak";
    case "F":
      return "Insufficient";
    default:
      return "Unrated";
  }
}

export default function EvidenceQualityBadge({
  grade,
  size = "small",
  showLabel = true,
  onClick,
}: EvidenceQualityBadgeProps) {
  const colors = getGradeColor(grade);
  const label = getGradeLabel(grade);
  const isSmall = size === "small";
  const isClickable = typeof onClick === "function";
  const display = grade ?? "—";

  return (
    <Tooltip
      title={
        isClickable
          ? `Click for details — ${display} (${label})`
          : `Evidence Quality: ${display} (${label})`
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
            fontSize: isSmall ? 12 : 14,
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {display}
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
