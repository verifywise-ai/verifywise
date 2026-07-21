import { fontSize, fontWeight } from "./typography";

export const tableStyles = {
  primary: {
    frame: {
      "border": "1px solid #d0d5dd",
      "borderRadius": "4px",
      "& td, & th": {
        border: 0,
      },
    },
    header: {
      backgroundColors: "linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)",
      row: {
        textTransform: "uppercase",
        borderBottom: "1px solid #d0d5dd",
        background: "linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)",
      },
      cell: {
        // Existing tables use base (13); textStyles.tableHeader is 12 for new work
        "color": "#475467",
        "fontSize": fontSize.base,
        "fontWeight": fontWeight.regular,
        "p": 6,
        "whiteSpace": "nowrap",
        "&:not(:lastChild)": {
          minWidth: "120px",
          width: "120px",
        },
      },
    },
    body: {
      backgroundColor: "white",
      row: {
        "textTransform": "none",
        "borderBottom": "1px solid #eaecf0",
        "backgroundColor": "white",
        "transition": "background-color 0.2s ease-in-out",
        "&:nth-of-type(even)": {
          backgroundColor: "#fafbfc",
        },
        "&:last-child": {
          borderBottom: "none", // Prevent double border with table frame
        },
        "&:hover td": {
          backgroundColor: "#f5f5f5", // Also defined in singleTheme.tableColors.rowHover
        },
        "&:hover": {
          cursor: "pointer",
        },
      },
      cell: {
        "fontSize": fontSize.base,
        "p": 6,
        "whiteSpace": "nowrap",
        "&:not(:lastChild)": {
          minWidth: "120px",
          width: "120px",
        },
      },
      button: {
        "fontSize": fontSize.base,
        "py": 1,
        "px": 4,
        "textTransform": "none",
        "borderRadius": "4px",
        "&:hover": {
          opacity: 0.9,
          backgroundColor: "#13715B",
          color: "#fff",
          border: "1px solid #13715B",
          cursor: "pointer",
        },
      },
    },
    footer: {
      cell: {
        fontSize: fontSize.caption,
        whiteSpace: "nowrap",
        opacity: 0.7,
      },
    },
  },
};
