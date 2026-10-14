import React from "react";
import { Box } from "@mui/material";
import GovernanceTooltip from "./GovernanceTooltip";
import StatusBadge from "../StatusBadge";
import { ChipVariant } from "../../types/interfaces/i.chip";

interface FrameworkChipProps {
  frameworkName: string;
  priority?: "primary" | "secondary" | "supplementary";
  size?: "small" | "medium";
}

const FRAMEWORK_SLUGS: Record<string, string> = {
  "eu ai act": "eu-ai-act",
  "iso 42001": "iso-42001",
  "iso 27001": "iso-27001",
  "nist ai rmf": "nist-ai-rmf",
};

const PRIORITY_VARIANT: Record<NonNullable<FrameworkChipProps["priority"]>, ChipVariant> = {
  primary: "success",
  secondary: "info",
  supplementary: "default",
};

const FrameworkChip: React.FC<FrameworkChipProps> = ({
  frameworkName,
  priority = "supplementary",
  size = "small",
}) => {
  const tooltip =
    priority === "supplementary"
      ? {
          header: "Inactive framework",
          description: "This framework is not currently assigned to the project",
        }
      : {
          header: "Active framework",
          description: "This framework is assigned to the project",
        };

  return (
    <GovernanceTooltip header={tooltip.header} description={tooltip.description}>
      <Box
        component="span"
        data-framework={FRAMEWORK_SLUGS[frameworkName.toLowerCase()] || frameworkName.toLowerCase()}
        data-priority={priority}
        sx={{ display: "inline-flex" }}
      >
        <StatusBadge label={frameworkName} variant={PRIORITY_VARIANT[priority]} size={size} />
      </Box>
    </GovernanceTooltip>
  );
};

export default FrameworkChip;
