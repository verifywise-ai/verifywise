import { Typography, Box, useTheme } from "@mui/material";
import { status } from "../../themes/palette";

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
        backgroundColor: "#ffebee",
        fontWeight: 600,
      };
    }
    if (lowerLine.includes("warn")) {
      return {
        color: "#f57c00",
        backgroundColor: "#fff3e0",
        fontWeight: 500,
      };
    }
    if (lowerLine.includes("success") || lowerLine.includes("successful")) {
      return {
        color: "#388e3c",
        backgroundColor: "#e8f5e8",
        fontWeight: 400,
      };
    }
    if (lowerLine.includes("info")) {
      return {
        color: "#1976d2",
        backgroundColor: "#e3f2fd",
        fontWeight: 400,
      };
    }
    if (lowerLine.includes("debug")) {
      return {
        color: "#6a1b9a",
        backgroundColor: "#f3e5f5",
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
        display: "flex",
        alignItems: "flex-start",
        gap: theme.spacing(2),
        py: theme.spacing(1),
        px: theme.spacing(2),
        borderBottom: `1px solid ${theme.palette.border.light}`,
        "&:last-child": {
          borderBottom: "none",
        },
        "&:hover": {
          backgroundColor: theme.palette.action.hover,
        },
        fontFamily: "monospace",
        fontSize: "13px",
        lineHeight: 1.5,
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
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
};

