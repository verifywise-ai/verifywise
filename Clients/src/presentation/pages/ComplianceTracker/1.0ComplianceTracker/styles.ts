import { styled } from "@mui/material/styles";
import { TableRow, Box } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";

export const StyledTableRow = styled(TableRow)<{ isflashing: number }>(({ isflashing }) => ({
  "& > *": {
    backgroundColor: isflashing ? "#e3f5e6" : "inherit",
    transition: "background-color 0.3s ease",
  },
  "&:hover > *": {
    backgroundColor: isflashing ? "#e3f5e6" : "#FBFBFB",
    cursor: "pointer",
  },
}));

export const AlertBox = styled(Box)(({ theme }) => ({
  position: "fixed",
  top: theme.spacing(2),
  right: theme.spacing(2),
  zIndex: 9999,
  width: "auto",
  maxWidth: "400px",
  textAlign: "left",
}));

export const styles = {
  cell: {
    ...singleTheme.tableStyles.primary.body.row,
    height: "36px",
  },

  descriptionCell: {
    ...singleTheme.tableStyles.primary.body.row,
    height: "36px",
    maxWidth: "450px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  alert: {
    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
  },

  progressBar: (theme: import("@mui/material/styles").Theme) => ({
    width: "100px",
    height: "5px",
    borderRadius: "4px",
    backgroundColor: theme.palette.grey[200],
  }),

  tableHead: {
    backgroundColors: singleTheme.tableStyles.primary.header.backgroundColors,
  },

  headerCell: singleTheme.tableStyles.primary.header.cell,
};
