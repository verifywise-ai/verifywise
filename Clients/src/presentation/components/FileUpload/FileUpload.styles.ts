import { styled } from "@mui/material/styles";
import { Dialog, DialogContent } from "@mui/material";

export const StyledDialog = styled(Dialog, {
  shouldForwardProp: (prop) => prop !== "modalHeight",
})<{ modalHeight?: number }>(({ modalHeight = 338 }) => ({
  backdropFilter: "blur(8px)", // Glass effect
  background: "rgba(0, 0, 0, 0.5)", // Slightly dark and blue with opacity
  ".MuiDialog-paper": {
    width: "384px",
    height: `${modalHeight}px`,
    borderRadius: "4px",
    maxHeight: "90vh",
    margin: "0 ",
    transition: "all 0.3s ease",
    padding: "0",
    overflow: "hidden",
  },
}));

export const StyledDialogContent = styled(DialogContent)(() => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  justifyContent: "space-between",
  padding: "32px",
  overflow: "visible",

  width: "100%",
  height: "100%",
}));

export const Container = styled("div")({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
});

export const DragDropArea = styled("div", {
  shouldForwardProp: (prop) => prop !== "uploadedFilesCount",
})<{ uploadedFilesCount?: number }>(({ uploadedFilesCount = 0 }) => ({
  width: "320px",
  minHeight: "200px",
  maxHeight: "400px",
  height: `${190 + Math.min(uploadedFilesCount * 40, 200)}px`,
  border: "1px dashed #D1D5DB",
  display: "flex",
  alignItems: "center",
  flexDirection: "column",
  justifyContent: "center",
  gap: 4,
  borderRadius: "8px",
  backgroundColor: "background.main",
  transition: "height 0.3s ease",
  overflowY: "auto",
  margin: "0 auto",
  boxSizing: "border-box",
  "& .uppy-Container": {
    display: "none !important",
    //remove default uppy container while maintaining drag drop functionality
  },
}));

export const Icon = styled("img")({
  width: "40px",
  height: "40px",
  marginBottom: "8px",
});

export const ButtonWrapper = styled("div")({
  display: "flex",
  justifyContent: "flex-end",
});

export const fileListStyleFrame = {
  mt: 2,
  borderTop: "1px solid status.default.border",
  width: "100%",
  padding: "8px",
  maxHeight: "300px",
  overflowY: "auto",
  boxSizing: "border-box",
};

export const filesListItem = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0",
};

export const fileListText = {
  fontSize: "12px",
  wordBreak: "break-word",
  maxWidth: "100%",
};
