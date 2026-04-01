import { useState, ReactNode } from "react";

import { Stack, Typography, Box } from "@mui/material";
import { ArrowRight as RightArrow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { background, border as borderPalette } from "../../../themes/palette";

interface HeaderCardProps {
  title: string;
  count: ReactNode;
  disableNavigation?: boolean;
  icon?: ReactNode;
  navigateTo?: string;
}

export function DashboardHeaderCard({ title, count, disableNavigation = false, icon, navigateTo }: HeaderCardProps) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const getNavigationPath = (cardTitle: string): string | null => {
    // If navigateTo is provided, use it directly
    if (navigateTo) return navigateTo;

    switch (cardTitle) {
      case "Trainings":
        return "/training";
      case "Models":
        return "/model-inventory";
      case "Reports":
        return "/reporting";
      default:
        return null;
    }
  };

  const navigationPath = getNavigationPath(title);
  const isClickable = navigationPath !== null && !disableNavigation;

  const handleClick = () => {
    if (navigationPath) {
      navigate(navigationPath);
    }
  };

  return (
    <Stack
      sx={{
        border: `1px solid ${borderPalette.dark}`,
        borderRadius: 2,
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        width: "100%",
        padding: "8px 36px 14px 14px",
        cursor: isClickable ? "pointer" : "default",
        position: "relative",
        overflow: "visible",
        transition: "all 0.2s ease",
        "&:hover": isClickable
          ? {
            background: `linear-gradient(135deg, ${background.accent} 0%, #f1f5f9 100%)`,
            borderColor: `${borderPalette.dark}`,
          }
          : {},
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <Typography
        sx={{
          fontSize: 13,
          color: "#8594AC",
          pb: "2px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </Typography>

      <Typography
        sx={{
          mt: 1,
          minHeight: 32,
          fontWeight: 600,
          fontSize: 15,
          color: "#1f2937",
          wordBreak: "break-word",
        }}
      >
        {count}
      </Typography>

      {icon ? (
        <Box
          sx={{
            position: "absolute",
            top: 10,
            right: 10,
            color: "#A9B3C5",
          }}
        >
          {icon}
        </Box>
      ) : isClickable ? (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            opacity: isHovered ? 1 : 0.3,
            transition: "opacity 0.2s ease",
          }}
        >
          <RightArrow size={16} />
        </Box>
      ) : null}
    </Stack>
  );
}
