import { IconButton, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Info as GreyCircleInfoIcon } from "lucide-react";
import { useUserGuideSidebarContext } from "../UserGuide";

interface HelperIconProps {
  /** Path to the User Guide article (e.g., "ai-governance/model-inventory") */
  articlePath: string;
  /** Optional heading block id to scroll to once the article opens (e.g., "governance-score") */
  sectionId?: string;
  size?: "small" | "medium" | "large";
}

function HelperIcon({ articlePath, sectionId, size = "small" }: HelperIconProps) {
  const theme = useTheme();
  const userGuideSidebar = useUserGuideSidebarContext();

  const handleClick = () => {
    userGuideSidebar.open(sectionId ? `${articlePath}#${sectionId}` : articlePath);
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
