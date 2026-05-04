import { Stack } from "@mui/material";
import { styled } from "@mui/material/styles";

export const StyledStack = styled(Stack)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${theme.palette.border.light}`,
  borderRadius: 2,
  backgroundColor: theme.palette.background.main,
  // minWidth: 300,
  width: "100%",
  maxWidth: "100%",
  padding: "10px 20px",
}));

export const styles = {
  gridTitle: {
    fontSize: 12,
    color: "#8594AC",
    pb: 1.5,
  },
  gridValue: {
    fontSize: 16,
    fontWeight: 600,
    color: "#2D3748",
  },
};
