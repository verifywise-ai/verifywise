import { Box } from "@mui/material";
import { MappingStrength } from "../../../domain/interfaces/i.governanceOs";
import { status } from "../../themes/palette";

const strengthConfig: Record<
  MappingStrength,
  { bg: string; text: string; border: string; label: string }
> = {
  direct: { ...status.success, label: "Direct" },
  partial: { ...status.warning, label: "Partial" },
  related: { ...status.info, label: "Related" },
};

interface MappingStrengthBadgeProps {
  strength: MappingStrength;
  size?: "small" | "medium";
}

const MappingStrengthBadge = ({ strength, size = "small" }: MappingStrengthBadgeProps) => {
  const config = strengthConfig[strength] || strengthConfig.related;
  const height = size === "small" ? 22 : 24;
  const fontSize = size === "small" ? 11 : 12;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        height,
        px: "8px",
        borderRadius: "4px",
        fontSize,
        fontWeight: 500,
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </Box>
  );
};

export default MappingStrengthBadge;
