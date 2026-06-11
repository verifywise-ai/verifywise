import { Box, Tooltip } from "@mui/material";
import { Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { accent } from "../../themes/palette";

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
      <Box
        onClick={() => navigate("/governance-os/mapper")}
        sx={{
          "display": "inline-flex",
          "alignItems": "center",
          "gap": "4px",
          "height": 24,
          "px": "8px",
          "borderRadius": "4px",
          "cursor": "pointer",
          "fontSize": 12,
          "fontWeight": 500,
          "backgroundColor": accent.indigo.bg,
          "color": accent.indigo.text,
          "border": `1px solid ${accent.indigo.border}`,
          "&:hover": {
            backgroundColor: accent.indigo.border,
          },
        }}
      >
        <Link2 size={14} />
        {mappingCount}
      </Box>
    </Tooltip>
  );
};

export default CrossMappingBadge;
