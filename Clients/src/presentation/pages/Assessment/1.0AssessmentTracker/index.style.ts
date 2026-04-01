import { brand, text } from "../../../themes/palette";
export const pageHeadingStyle = {
  paddingBottom: 8.5,
  fontSize: 16,
  fontWeight: 600,
  color: `${text.primary}`,
};

export const topicsListStyle = {
  minWidth: "fit-content",
  maxWidth: "max-content",
  padding: 8,
  paddingTop: 0,
  overflowY: "auto",
};

export const subHeadingStyle = { color: `${text.icon}`, fontSize: 11, marginY: 6 };

export const listItemStyle = {
  display: "block",
  "& .MuiListItemButton-root.Mui-selected": {
    backgroundColor: `${brand.primary}`,
  },
  "& .MuiListItemButton-root.Mui-selected:hover": {
    backgroundColor: `${brand.primary}`,
  },
};
