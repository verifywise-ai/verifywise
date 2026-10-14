import StatusBadge from "../StatusBadge";
import { MappingStrength } from "../../../domain/interfaces/i.governanceOs";
import { ChipVariant } from "../../types/interfaces/i.chip";
import GovernanceTooltip from "./GovernanceTooltip";

const strengthConfig: Record<
  MappingStrength,
  { variant: ChipVariant; label: string; header: string; description: string }
> = {
  direct: {
    variant: "success",
    label: "Direct",
    header: "Direct mapping",
    description: "Source control fully satisfies the target control",
  },
  partial: {
    variant: "warning",
    label: "Partial",
    header: "Partial mapping",
    description: "Controls overlap but each has unique requirements",
  },
  related: {
    variant: "info",
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

  return (
    <GovernanceTooltip header={config.header} description={config.description}>
      <span>
        <StatusBadge label={config.label} variant={config.variant} size={size} />
      </span>
    </GovernanceTooltip>
  );
};

export default MappingStrengthBadge;
