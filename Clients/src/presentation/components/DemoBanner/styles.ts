import { styled } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";

export const Container = styled(Box)(({ theme }) => ({
  width: "100%",
  backgroundColor: theme.palette.status.success.light,
  borderRadius: theme.shape.borderRadius,
  textAlign: "center",
  alignContent: "center",
  padding: theme.spacing(3, 6),
  position: "relative",
  top: "-15px",
}));

export const Text = styled(Typography)(({ theme }) => ({
  fontWeight: 500,
  lineHeight: "20px",
  letterSpacing: "-0.6%",
  color: theme.palette.primary.main,
}));
