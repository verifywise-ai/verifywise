import { useTheme } from "@mui/material/styles";

export const useStyles = () => {
  const theme = useTheme();

  return {
    root: {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(4),
      fontSize: 13,
      width: "100%",
      margin: "0 auto",
    },
    card: {
      background: theme.palette.background.paper,
      border: `1.5px solid ${theme.palette.border.light}`,
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(5, 6),
      marginBottom: theme.spacing(4),
      boxShadow: "none",
      width: "100%",
    },
    sectionTitle: {
      fontWeight: 600,
      fontSize: 16,
      marginBottom: theme.spacing(10),
      color: theme.palette.text.primary,
    },
    saveButton: {
      alignSelf: "flex-end",
      width: "fit-content",
      gap: 2,
    },
  };
};
