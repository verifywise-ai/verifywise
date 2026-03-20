import React from "react";
import { IconButton, Box } from "@mui/material";
import { Info as GreyCircleInfoIcon } from "lucide-react";
import { text } from "../../themes/palette";

interface MetricInfoIconProps {
  onClick: () => void;
  size?: "small" | "medium" | "large";
}

const MetricInfoIcon = React.forwardRef<HTMLDivElement, MetricInfoIconProps>(({ onClick, size = "small", ...props }, ref) => {
  return (
    <Box ref={ref} {...props}>
      <IconButton
        disableRipple
        onClick={onClick}
        aria-label="Open help information"
        size={size}
        sx={{
          color: `${text.disabled}`, // Lighter gray
          backgroundColor: "transparent",
          padding: "4px", // Smaller padding for smaller icon
          "&:hover": {
            backgroundColor: "rgba(156, 163, 175, 0.1)",
          },
        }}
      >
        <GreyCircleInfoIcon size={16} />
      </IconButton>
    </Box>
  );
});

MetricInfoIcon.displayName = 'MetricInfoIcon';

export default MetricInfoIcon;
