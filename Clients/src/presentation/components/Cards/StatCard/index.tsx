import { useState } from "react";
import { Card, CardContent, Box, Typography, Tooltip, useTheme } from "@mui/material";
import { Info } from "lucide-react";
import { cardStyles } from "../../../themes";
import { palette } from "../../../themes/palette";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  Icon: LucideIcon;
  highlight?: boolean;
  active?: boolean;
  subtitle?: string;
  tooltip?: string;
  onClick?: () => void;
}

export function StatCard({ title, value, Icon, highlight, active, subtitle, tooltip, onClick }: StatCardProps) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      elevation={0}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        ...(cardStyles.base(theme) as Record<string, unknown>),
        background: active
          ? `linear-gradient(135deg, ${palette.background.accent} 0%, #F1F5F9 100%)`
          : "linear-gradient(135deg, #FEFFFE 0%, #F8F9FA 100%)",
        border: active
          ? `1.5px solid ${palette.brand.primary}`
          : `1.5px solid ${palette.border.light}`,
        height: "100%",
        minHeight: "80px",
        position: "relative",
        transition: "all 0.2s ease",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        borderRadius: "8px",
        overflow: "hidden",
        ...(onClick && { cursor: "pointer" }),
        "&:hover": {
          background: `linear-gradient(135deg, ${palette.background.accent} 0%, #F1F5F9 100%)`,
          borderColor: palette.border.dark,
        },
      }}
    >
      <CardContent
        sx={{
          p: "14px 16px",
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
          "&:last-child": { pb: "14px" },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            bottom: "-20px",
            right: "-20px",
            opacity: isHovered ? 0.06 : 0.03,
            transform: isHovered ? "translateY(-4px)" : "translateY(0px)",
            zIndex: 0,
            pointerEvents: "none",
            transition: "opacity 0.2s ease, transform 0.3s ease",
          }}
        >
          <Icon size={64} />
        </Box>
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "4px", mb: 0.5 }}>
            <Typography
              sx={{
                color: palette.status.default.text,
                fontSize: "11px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {title}
            </Typography>
            {tooltip && (
              <Tooltip title={tooltip} arrow placement="top">
                <Box sx={{ display: "flex", alignItems: "center", cursor: "help", ml: "2px" }}>
                  <Info size={14} color={palette.text.disabled} />
                </Box>
              </Tooltip>
            )}
          </Box>
          <Typography
            sx={{
              fontSize: "20px",
              fontWeight: 600,
              color: active
                ? palette.brand.primary
                : highlight
                  ? palette.status.error.text
                  : palette.text.primary,
              lineHeight: 1.3,
            }}
          >
            {value}
          </Typography>
          {subtitle && (
            <Typography
              sx={{
                fontSize: "10px",
                color: palette.text.disabled,
                mt: 0.25,
                fontWeight: 400,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
