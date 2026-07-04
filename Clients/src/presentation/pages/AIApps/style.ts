export const mainStackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  padding: "0 8px 8px 8px",
  width: "100%",
  minHeight: "calc(100vh - 200px)",
};

export const toolbarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

export const filterRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

export const catalogGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: "16px",
};

export const catalogCardStyle = {
  "padding": "16px",
  "borderRadius": "4px",
  "border": "1px solid",
  "borderColor": "border.light",
  "backgroundColor": "background.main",
  "cursor": "pointer",
  "transition": "box-shadow 0.2s ease-in-out",
  "&:hover": {
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
};

export const cardHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  mb: "16px",
};

export const cardTitleStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};
