import { SxProps, Theme } from "@mui/material";
import { layoutStyles } from "../../../themes";

export const containerStyle: SxProps<Theme> = {
  width: "100%",
  mt: 2,
};

export const headerContainerStyle: SxProps<Theme> = {
  ...layoutStyles.flexBetween(),
  flexWrap: "wrap",
  gap: 2,
  mb: 2,
};

export const tabListStyle: SxProps<Theme> = {
  "minHeight": "20px",
  "& .MuiTabs-flexContainer": {
    columnGap: "34px",
  },
};
