import { Box } from "@mui/material";
import { Link2 } from "lucide-react";
import { useNavigate } from "react-router";
import GovernanceTooltip from "./GovernanceTooltip";
import StatusBadge from "../StatusBadge";

interface CrossMappingBadgeProps {
  mappingCount: number;
}

const CrossMappingBadge = ({ mappingCount }: CrossMappingBadgeProps) => {
  const navigate = useNavigate();

  if (mappingCount === 0) return null;

  return (
    <GovernanceTooltip
      header="Cross-framework mappings"
      description="Number of mappings linked to this control"
    >
      <Box
        component="span"
        onClick={() => navigate("/governance-os/mapper")}
        sx={{ display: "inline-flex", cursor: "pointer" }}
      >
        <StatusBadge label={String(mappingCount)} variant="info" icon={<Link2 size={14} />} />
      </Box>
    </GovernanceTooltip>
  );
};

export default CrossMappingBadge;
