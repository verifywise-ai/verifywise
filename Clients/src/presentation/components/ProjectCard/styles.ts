/**
 * This file is currently in use
 */

import { Box, Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";

export const Card = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  // minWidth: 300,
  width: "100%",
  maxWidth: "100%",
  padding: "19px 34px 15px 13px",
  border: `1px solid ${theme.palette.border.light}`,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.main,
}));

export const Title = styled(Typography)(({ theme }) => ({
  color: "#2D3748",
  fontWeight: 600,
  marginBottom: "10px",
  fontSize: theme.typography.fontSize,
}));

export const SubtitleValue = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.secondary,
  fontSize: theme.typography.fontSize,
}));

export const Btn = styled(Button)(({ theme }) => ({
  "textTransform": "none",
  "borderRadius": 2,
  "maxHeight": 34,
  "borderColor": theme.palette.border.dark,
  "color": theme.palette.text.secondary,
  "boxShadow": "none",
  "backgroundColor": theme.palette.background.main,
  "&:hover": {
    boxShadow: "none",
  },
}));

export const styles = {
  subtitle: {
    color: "#8594AC",
    fontSize: 11,
  },
  imageBox: {
    maxWidth: 18.24,
    maxHeight: 18,
    borderRadius: 2,
  },
  imageTitle: {
    color: "#8594AC",
    fontSize: 12,
    ml: 2,
  },
  upperBox: {
    display: "flex",
    justifyContent: "space-between",
    mb: 10,
  },
  lowerBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    mt: 5,
  },
  progressBarTitle: {
    color: "#8594AC",
    fontSize: 11,
    mb: 10,
    mt: 1,
  },
};
