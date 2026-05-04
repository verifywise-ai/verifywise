import { useTheme } from "@mui/material";

export const useCategoryStyles = () => {
  const theme = useTheme();

  return {
    stackStyle: {
      display: "flex",
      gap: theme.spacing(4),
    },
  };
};
