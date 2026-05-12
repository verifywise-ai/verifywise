import { Chip, Tooltip } from "@mui/material";
import { Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CrossMappingBadgeProps {
  mappingCount: number;
  controlIdentifier?: string;
}

const CrossMappingBadge = ({ mappingCount, controlIdentifier }: CrossMappingBadgeProps) => {
  const navigate = useNavigate();

  if (mappingCount === 0) return null;

  return (
    <Tooltip
      title={`${mappingCount} cross-framework mapping(s)${controlIdentifier ? ` for ${controlIdentifier}` : ""}`}
    >
      <Chip
        icon={<Link2 size={14} />}
        label={mappingCount}
        size="small"
        color="info"
        variant="outlined"
        onClick={() => navigate("/governance-os/mapper")}
        sx={{ cursor: "pointer" }}
      />
    </Tooltip>
  );
};

export default CrossMappingBadge;
