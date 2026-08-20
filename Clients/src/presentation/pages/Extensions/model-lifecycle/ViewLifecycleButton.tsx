/**
 * ViewLifecycleButton - Icon button that navigates to model lifecycle detail
 * page. Renders beside the gear icon in the model inventory table.
 */

import React from "react";
import { IconButton, Tooltip, useTheme } from "@mui/material";
import { Layers } from "lucide-react";
import { useNavigate } from "react-router";

interface ViewLifecycleButtonProps {
  modelId: number;
  modelName?: string;
}

const ViewLifecycleButton: React.FC<ViewLifecycleButtonProps> = ({ modelId }) => {
  const navigate = useNavigate();
  const theme = useTheme();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/model-inventory/models/${modelId}`);
  };

  return (
    <Tooltip title="View lifecycle" arrow placement="top">
      <IconButton
        size="small"
        onClick={handleClick}
        sx={{
          "color": theme.palette.text.tertiary,
          "&:hover": {
            color: theme.palette.primary.main,
            backgroundColor: `${theme.palette.primary.main}14`,
          },
        }}
      >
        <Layers size={16} />
      </IconButton>
    </Tooltip>
  );
};

export default ViewLifecycleButton;
