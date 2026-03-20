import { border as borderPalette } from "../../../../themes/palette";
export const inputStyles = {
  minWidth: 100,
  maxWidth: 200,
  height: 34,
};

export const dropdownStyles = {
  borderRadius: 2,
  padding: "0 12px 0 0",
  fontSize: 13,
  color: "#111827",
  "&:hover": {
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: "rgba(0, 0, 0, 0.23)",
    },
  },
  "&.Mui-focused": {
    "& .MuiOutlinedInput-notchedOutline": {
      border: `1px solid ${borderPalette.dark}`,
    },
  },
  "& .MuiOutlinedInput-notchedOutline": {
    border: `1px solid ${borderPalette.dark}`,
  },
};
