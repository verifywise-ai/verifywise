import { Chip } from "@mui/material";
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
  return (
    <Chip
      label={config.label}
      size={size}
      sx={{
        fontSize: 11,
        height: 22,
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    />
  );
};

export default MappingStrengthBadge;
