import { Typography, Box, useTheme } from "@mui/material";
import { status, palette as vwPalette } from "../../themes/palette";

interface LogLineProps {
  line: string;
  index: number;
}

export function LogLine({ line, index }: LogLineProps) {
  const theme = useTheme();

  // Function to determine log level and apply appropriate styling
  const getLogLevelStyle = (logLine: string) => {
    const lowerLine = logLine.toLowerCase();

    if (lowerLine.includes("error")) {
      return {
        color: `${status.error.text}`,
        backgroundColor: status.error.bg,
        fontWeight: 600,
      };
    }
    if (lowerLine.includes("warn")) {
      return {
        color: status.warning.text,
        backgroundColor: status.warning.bg,
        fontWeight: 500,
      };
    }
    if (lowerLine.includes("success") || lowerLine.includes("successful")) {
      return {
        color: status.success.text,
        backgroundColor: status.success.bg,
        fontWeight: 400,
      };
    }
    if (lowerLine.includes("info")) {
      return {
        color: status.info.text,
        backgroundColor: vwPalette.status.info.bg,
        fontWeight: 400,
      };
    }
    if (lowerLine.includes("debug")) {
      return {
        color: vwPalette.accent.purple.text,
        backgroundColor: vwPalette.accent.purple.bg,
        fontWeight: 400,
      };
    }

    return {
      color: theme.palette.text.primary,
      backgroundColor: "transparent",
      fontWeight: 400,
    };
  };

  const logStyle = getLogLevelStyle(line);

  return (
    <Box
      sx={{
        "display": "flex",
        "alignItems": "flex-start",
        "gap": theme.spacing(2),
        "py": theme.spacing(1),
        "px": theme.spacing(2),
        "borderBottom": `1px solid ${theme.palette.border.light}`,
        "&:last-child": {
          borderBottom: "none",
        },
        "&:hover": {
          backgroundColor: theme.palette.action.hover,
        },
        "fontFamily": "monospace",
        "fontSize": "13px",
        "lineHeight": 1.5,
        "wordBreak": "break-word",
        "whiteSpace": "pre-wrap",
      }}
    >
      <Typography
        sx={{
          color: theme.palette.text.secondary,
          fontSize: "12px",
          fontWeight: 500,
          minWidth: "60px",
          textAlign: "right",
          userSelect: "none",
        }}
      >
        {index + 1}
      </Typography>
      <Typography
        sx={{
          flex: 1,
          ...logStyle,
          padding: theme.spacing(0.5, 1),
          borderRadius: theme.shape.borderRadius,
          fontSize: "13px",
          fontFamily: "monospace",
        }}
      >
        {line}
      </Typography>
    </Box>
  );
}
