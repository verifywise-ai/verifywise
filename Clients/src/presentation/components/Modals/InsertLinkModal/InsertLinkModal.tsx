import React, { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Box } from "@mui/material";
import Field from "../../Inputs/Field";
import { CustomizableButton } from "../../button/customizable-button";

interface InsertLinkModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (url: string, text?: string) => void;
  /** Pre-selected text from the editor */
  selectedText?: string;
}

const InsertLinkModal: React.FC<InsertLinkModalProps> = ({
  open,
  onClose,
  onInsert,
  selectedText,
}) => {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  const hasSelection = !!selectedText?.trim();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setUrl("");
      setText("");
    }
  }, [open]);

  const handleInsert = () => {
    if (url.trim() !== "") {
      // If there's a selection, pass undefined for text so insertLink wraps the selection
      onInsert(url.trim(), hasSelection ? undefined : text.trim() || undefined);
      setUrl("");
      setText("");
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      disablePortal={false}
      sx={{ zIndex: 1400 }}
      PaperProps={{
        sx: { borderRadius: 3, p: 1.5 },
      }}
    >
      <DialogTitle>Insert link</DialogTitle>

      <DialogContent>
        {hasSelection && (
          <Box
            sx={{
              mb: 2,
              p: 1.5,
              backgroundColor: "#F5F7F6",
              borderRadius: "4px",
              border: "1px solid #D9E0DD",
            }}
          >
            <Typography sx={{ fontSize: 12, color: "#667085", mb: 0.5 }}>Selected text</Typography>
            <Typography sx={{ fontSize: 13, color: "#344054", fontWeight: 500 }}>
              {selectedText}
            </Typography>
          </Box>
        )}
        <Field
          label="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          https
          placeholder="Enter the link URL"
          isRequired
          sx={{ mb: 2 }}
        />
        {!hasSelection && (
          <Field
            label="Display text (optional)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            type="text"
            placeholder="Enter the display text (optional)"
            sx={{ mb: 2, mt: 1 }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ padding: 2, justifyContent: "flex-end", gap: 2 }}>
        <CustomizableButton
          text="Cancel"
          variant="text"
          sx={{ color: "#344054", px: "32px", width: 120 }}
          onClick={onClose}
        />
        <CustomizableButton
          text="Insert"
          variant="contained"
          color="primary"
          sx={{ width: 120 }}
          onClick={(e) => {
            (e as React.MouseEvent).stopPropagation();
            handleInsert();
          }}
          isDisabled={!url.trim()}
        />
      </DialogActions>
    </Dialog>
  );
};

export default InsertLinkModal;
