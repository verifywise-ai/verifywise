import { Theme } from "@mui/material/styles";
import { brand, text, background } from "../../../../themes/palette";

export const styles = {
  btnWrap: {
    marginTop: 'auto',
    paddingTop: 12,
    display: "flex",
    alignItems: "flex-end",
  },
  CustomizableButton: {
    width: { xs: "100%", sm: 160 },
    backgroundColor: `${brand.primary}`,
    color: `${background.main}`,
    border: `1px solid ${brand.primary}`,
    gap: 2,
  },
  titleText: {
    fontSize: 16,
    color: `${text.secondary}`,
    fontWeight: "bold",
  },
  baseText: {
    color: `${text.secondary}`,
    fontSize: 13,
  },
};

export const fieldStyle = (theme: Theme) => ({
  fontWeight: "bold",
  backgroundColor: theme.palette.background.main,
  "& input": {
    padding: "0 14px",
  },
});

export const selectReportStyle = (theme: Theme) => ({
  width: "100%",
  backgroundColor: theme.palette.background.main,
});
