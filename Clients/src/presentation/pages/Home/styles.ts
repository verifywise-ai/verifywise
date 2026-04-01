import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';

export const NoProjectBox = styled(Box)(({ theme }) => ({ 
  display: "block",
  width: "100%",
  border: `1px solid ${theme.palette.border.light}`,
  borderRadius: 2,
  backgroundColor: theme.palette.background.main,
  paddingTop: "68px",
  paddingBottom: "79px",
}));

export const styles = {
    title: {
      color: "text.primary",
      fontSize: 16,
      fontWeight: 600,
    },
    projectBox: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      mb: 9,
    }
}