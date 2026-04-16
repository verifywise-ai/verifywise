/**
 * Controls Hub — CSV export confirmation modal.
 *
 * A tiny dialog that warns the user what's in the CSV and triggers the
 * download when confirmed. The backend already composes the file and sets
 * Content-Disposition; we just stream the Blob through the browser's
 * anchor-click idiom in `triggerBrowserDownload`.
 */
import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { Download } from "lucide-react";

import { exportMasterControlsCsv } from "../../../../../application/repository/masterControl.repository";
import { triggerBrowserDownload } from "../../../../utils/browserDownload.utils";

interface CsvExportModalProps {
  open: boolean;
  onClose: () => void;
  /** Total number of master controls the user will export (shown for context). */
  totalControls?: number;
}

export default function CsvExportModal({
  open,
  onClose,
  totalControls,
}: CsvExportModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      const { blob, filename } = await exportMasterControlsCsv();
      triggerBrowserDownload(blob, filename);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to export the CSV. Please try again."
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    if (isDownloading) return;
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="csv-export-dialog-title"
      PaperProps={{
        sx: {
          width: 460,
          maxWidth: "95vw",
          padding: "28px",
        },
      }}
    >
      <DialogTitle
        id="csv-export-dialog-title"
        sx={{ fontSize: 16, padding: 0, paddingBottom: 2 }}
      >
        Export master controls to CSV
      </DialogTitle>
      <DialogContent sx={{ padding: 0 }}>
        <DialogContentText sx={{ fontSize: 13, lineHeight: 1.55 }}>
          You're about to download a CSV containing every master control in
          this organization. Each row includes the control's title, status,
          owner/reviewer/approver, due date, description, implementation
          details, and the mapping counts per framework (EU AI Act, ISO 42001,
          ISO 27001, NIST AI RMF) plus the list of mapped entity codes.
        </DialogContentText>

        {typeof totalControls === "number" && (
          <Typography
            fontSize={12}
            color="text.secondary"
            sx={{ marginTop: 1.5 }}
          >
            {totalControls} master control{totalControls === 1 ? "" : "s"} will
            be exported.
          </Typography>
        )}

        {error && (
          <Alert severity="error" sx={{ fontSize: 13, marginTop: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ padding: 0, paddingTop: 3 }}>
        <Stack direction="row" spacing={1.5}>
          <Button onClick={handleClose} disabled={isDownloading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={isDownloading}
            startIcon={<Download size={14} />}
          >
            {isDownloading ? "Downloading…" : "Download CSV"}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
