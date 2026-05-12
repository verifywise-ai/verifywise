import { IconButton, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Info as GreyCircleInfoIcon } from "lucide-react";
import { useUserGuideSidebarContext } from "../UserGuide";

interface HelperIconProps {
  /** Path to the User Guide article (e.g., "ai-governance/model-inventory") */
  articlePath: string;
  size?: "small" | "medium" | "large";
}

function HelperIcon({ articlePath, size = "small" }: HelperIconProps) {
  const theme = useTheme();
  const userGuideSidebar = useUserGuideSidebarContext();

  const handleClick = () => {
    userGuideSidebar.open(articlePath);
  };

  return (
    <IconButton
      disableRipple
      onClick={handleClick}
      aria-label="Open help information"
      size={size}
      sx={{
        "color": theme.palette.text.secondary,
        "backgroundColor": "transparent",
        "padding": 0.5,
        "&:hover": {
          backgroundColor: alpha(theme.palette.text.secondary, 0.1),
        },
      }}
    >
      <GreyCircleInfoIcon size={16} />
    </IconButton>
  );
}

export default HelperIcon;
