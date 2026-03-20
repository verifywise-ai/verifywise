import { brand, text, background } from "../../../themes/palette";
export const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  buttonStyle: {
    width: { xs: "100%", sm: "180px" },
    backgroundColor: `${brand.primary}`,
    color: `${background.main}`,
    gap: 2,
  },
  baseText: {
    color: `${text.secondary}`,
    fontSize: 13,
  },
};
