import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";

interface ErrorModalProps {
  open: boolean;
  errorMessage: string | null;
  handleClose: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({ open, errorMessage, handleClose }) => {
  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Error</DialogTitle>
      <DialogContent>
        <Typography color="error">{errorMessage}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ErrorModal;
