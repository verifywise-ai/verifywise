import { useTheme } from "@mui/material";

export const useGuiderStyles = () => {
  const theme = useTheme();

  return {
    helperFrameStyle: {
      "backgroundColor": theme.palette.background.fill,
      "border": `1px solid ${theme.palette.border.light}`,
      "p": theme.spacing(1.5),
      "borderRadius": "50%",
      "& svg": {
        "& path": {
          fill: theme.palette.text.secondary,
        },
      },
      "&:focus": { outline: "none" },
      "&:hover": {
        backgroundColor: theme.palette.border,
        borderColor: theme.palette.border,
        cursor: "pointer",
      },
    },
  };
};
