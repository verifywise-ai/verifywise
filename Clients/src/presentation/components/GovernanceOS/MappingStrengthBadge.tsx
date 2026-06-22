import { Box } from "@mui/material";
import { MappingStrength } from "../../../domain/interfaces/i.governanceOs";
import { status } from "../../themes/palette";
import GovernanceTooltip from "./GovernanceTooltip";

const strengthConfig: Record<
  MappingStrength,
  { bg: string; text: string; border: string; label: string; header: string; description: string }
> = {
  direct: {
    ...status.success,
    label: "Direct",
    header: "Direct mapping",
    description: "Source control fully satisfies the target control",
  },
  partial: {
    ...status.warning,
    label: "Partial",
    header: "Partial mapping",
    description: "Controls overlap but each has unique requirements",
  },
  related: {
    ...status.info,
    label: "Related",
    header: "Related mapping",
    description: "Similar topics but the controls are not interchangeable",
  },
};

interface MappingStrengthBadgeProps {
  strength: MappingStrength;
  size?: "small" | "medium";
}

const MappingStrengthBadge = ({ strength, size = "small" }: MappingStrengthBadgeProps) => {
  const config = strengthConfig[strength] || strengthConfig.related;
  const height = size === "small" ? 22 : 24;
  const fontSize = size === "small" ? 11 : 12;
  const badge = (
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

  return (
    <GovernanceTooltip header={config.header} description={config.description}>
      <span>{badge}</span>
    </GovernanceTooltip>
  );
};

export default MappingStrengthBadge;
