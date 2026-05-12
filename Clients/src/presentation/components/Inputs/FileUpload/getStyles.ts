import { Theme } from "@mui/material";

/**
 * Generates a set of styles for the FileUpload component based on the provided theme.
 *
 * @param theme - The theme object containing palette, shape, and other design tokens.
 * @returns An object containing style definitions for various parts of the FileUpload component.
 *
 * @property container - Styles for the main container of the FileUpload component.
 * @property header - Styles for the header section, typically used for alignment and layout.
 * @property fileList - Styles for the file list container, including dimensions and scroll behavior.
 * @property fileItem - Styles for individual file items in the file list.
 * @property fileLink - Styles for file links, including hover effects.
 * @property fileName - Styles for displaying file names with ellipsis for overflow handling.
 */
const getStyles = (theme: Theme) => ({
  container: {
    gap: 10,
    alignItems: "center",
    padding: 10,
    border: 1,
    borderColor: theme.palette.border.light,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.main,
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    width: "100%",
  },
  fileList: {
    width: "100%",
    height: 100,
    padding: 2,
    border: 1,
    borderColor: theme.palette.border.light,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.main,
    overflowY: "auto",
  },
  fileItem: {
    padding: 1,
    borderBottom: "1px solid",
    borderColor: theme.palette.border.light,
  },
  fileLink: {
    "textDecoration": "none",
    "color": theme.palette.primary.main,
    "&:hover": {
      textDecoration: "underline",
    },
  },
  fileName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "300px",
    display: "inline-block",
  },
});

export default getStyles;
