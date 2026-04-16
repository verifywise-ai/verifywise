/**
 * Controls Hub — Create Master Control dialog.
 *
 * Minimal form to create a master control from the Controls Hub page.
 * Only collects the two required fields (`title`, `status`) plus an
 * optional description. Owner, reviewer, approver, due date, and
 * implementation details are filled in later via the Details tab —
 * keeping this dialog small so new controls can be drafted quickly.
 *
 * On successful create, the dialog closes and the parent is told the
 * new master control's id so it can open the drawer for follow-up edits.
 */
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  type SelectChangeEvent,
} from "@mui/material";
import { Plus } from "lucide-react";

import Field from "../../../../components/Inputs/Field";
import Select from "../../../../components/Inputs/Select";
import { useMasterControlMutations } from "../../../../../application/hooks/useMasterControls";
import {
  MASTER_CONTROL_STATUSES,
  type MasterControlStatus,
} from "../../../../../domain/models/Common/masterControl/masterControl.model";

interface CreateMasterControlDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}

export default function CreateMasterControlDialog({
  open,
  onClose,
  onCreated,
}: CreateMasterControlDialogProps) {
  const { create } = useMasterControlMutations();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<MasterControlStatus>("Waiting");
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the dialog reopens so stale input isn't carried over.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setStatus("Waiting");
    setError(null);
  }, [open]);

  const statusItems = MASTER_CONTROL_STATUSES.map((s) => ({ _id: s, name: s }));

  const handleSubmit = async () => {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }

    try {
      const response = await create.mutateAsync({
        title: trimmed,
        description: description.trim() || null,
        status,
      });
      // STATUS_CODE[201] returns { message, data }, wrapped by apiServices
      // → `response.data` is the created row.
      const created =
        (response as any)?.data ?? (response as any) ?? {};
      if (typeof created.id === "number") {
        onCreated(created.id);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create master control."
      );
    }
  };

  const handleClose = () => {
    if (create.isPending) return;
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="create-master-control-title"
      PaperProps={{
        sx: { width: 480, maxWidth: "95vw", padding: "28px" },
      }}
    >
      <DialogTitle
        id="create-master-control-title"
        sx={{ fontSize: 16, padding: 0, paddingBottom: 2 }}
      >
        New master control
      </DialogTitle>

      <DialogContent sx={{ padding: 0 }}>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" sx={{ fontSize: 13 }}>
              {error}
            </Alert>
          )}

          <Field
            id="new-master-control-title"
            type="text"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short, unique name for this control"
            isRequired
            disabled={create.isPending}
          />

          <Field
            id="new-master-control-description"
            type="description"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this control cover? (optional)"
            disabled={create.isPending}
          />

          <Select
            id="new-master-control-status"
            label="Status"
            value={status}
            items={statusItems}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setStatus(e.target.value as MasterControlStatus)
            }
            sx={{ width: "100%", height: 34 }}
            isRequired
            disabled={create.isPending}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ padding: 0, paddingTop: 3 }}>
        <Stack direction="row" spacing={1.5}>
          <Button onClick={handleClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={create.isPending || !title.trim()}
            startIcon={<Plus size={14} />}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
