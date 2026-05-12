const fontSizes = {
  small: "11px",
  medium: "13px",
  large: "16px",
};

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
        "color": "#475467",
        "fontSize": fontSizes.medium,
        "fontWeight": 400,
        "padding": "14px 12px",
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
        "fontSize": fontSizes.medium,
        "padding": "14px 12px",
        "whiteSpace": "nowrap",
        "&:not(:lastChild)": {
          minWidth: "120px",
          width: "120px",
        },
      },
      button: {
        "fontSize": fontSizes.medium,
        "padding": "2px 8px",
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
        fontSize: fontSizes.small,
        whiteSpace: "nowrap",
        opacity: 0.7,
      },
    },
  },
};
