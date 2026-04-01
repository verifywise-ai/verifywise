import { text } from "../../../themes/palette";
export const vwhomeHeading = {
  color: `${text.primary}`,
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 8,
};

export const headerCardPlaceholder = {
  minHeight: 68,
  minWidth: 300,
  width: "100%",
  maxWidth: "100%",
};

export const vwhomeHeaderCards = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  gap: "20px",
};

export const vwhomeBody = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
};

export const vwhomeBodyControls = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 2,
};

export const vwhomeBodyProjects = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: "20px",
};

export const vwhomeBodyProjectsGrid = {
  display: "grid",
  gridTemplateColumns: {
    xs: "repeat(1, 1fr)",
    sm: "repeat(2, 1fr)",
    md: "repeat(3, 1fr)",
  },
  gap: { xs: 10, md: 10 },
  width: "100%",
};

export const vwhomeCreateModalFrame = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  bgcolor: "background.paper",
  boxShadow: 24,
  p: 4,
  borderRadius: 1,
};
