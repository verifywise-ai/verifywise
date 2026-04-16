/**
 * Controls Hub — Bulk Edit Bar.
 *
 * Surfaces when the user has selected one or more master controls in the
 * matrix. Offers three orthogonal edits — status, owner, due date — that the
 * backend fans out to every mapped framework row via the same propagation
 * path used by single updates. Fields are independent: the user only sets
 * the ones they want to change, and the bar builds a sparse patch.
 *
 * Demo rows are selectable but the backend rejects them (`canBeModified`).
 * We surface a per-row result summary after the call so the user can see
 * which rows succeeded.
 */
import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Divider,
  IconButton,
  Stack,
  Typography,
  useTheme,
  type SelectChangeEvent,
} from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { X as CloseIcon, Wand2 } from "lucide-react";

import Select from "../../../../components/Inputs/Select";
import DatePicker from "../../../../components/Inputs/Datepicker";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import useUsers from "../../../../../application/hooks/useUsers";
import { useMasterControlMutations } from "../../../../../application/hooks/useMasterControls";
import {
  MASTER_CONTROL_STATUSES,
  type MasterControlStatus,
} from "../../../../../domain/models/Common/masterControl/masterControl.model";
import type { MasterControlUpdatePayload } from "../../../../../application/repository/masterControl.repository";

const FIELD_SX = {
  minWidth: 180,
  maxWidth: 220,
  height: 34,
};

interface BulkEditBarProps {
  selectedIds: number[];
  onClearSelection: () => void;
}

type StatusValue = MasterControlStatus | "";

export default function BulkEditBar({
  selectedIds,
  onClearSelection,
}: BulkEditBarProps) {
  const theme = useTheme();
  const { users } = useUsers();
  const { bulkUpdate } = useMasterControlMutations();

  const [status, setStatus] = useState<StatusValue>("");
  const [owner, setOwner] = useState<number | "">("");
  const [dueDate, setDueDate] = useState<Dayjs | null>(null);
  const [feedback, setFeedback] = useState<
    | {
        severity: "success" | "error" | "info";
        message: string;
      }
    | null
  >(null);

  const userItems = useMemo(
    () => users.map((u) => ({ _id: u.id, name: `${u.name} ${u.surname}` })),
    [users]
  );

  const statusItems = [
    { _id: "", name: "— keep existing —" },
    ...MASTER_CONTROL_STATUSES.map((s) => ({ _id: s, name: s })),
  ];

  const buildPatch = (): MasterControlUpdatePayload => {
    const patch: MasterControlUpdatePayload = {};
    if (status !== "") patch.status = status;
    if (owner !== "") patch.owner = owner;
    if (dueDate) patch.due_date = dueDate.toISOString();
    return patch;
  };

  const resetForm = () => {
    setStatus("");
    setOwner("");
    setDueDate(null);
  };

  const handleApply = async () => {
    setFeedback(null);

    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setFeedback({
        severity: "info",
        message: "Pick at least one field to apply to the selected controls.",
      });
      return;
    }

    try {
      const result = await bulkUpdate.mutateAsync({ ids: selectedIds, patch });
      const { updated, failed, total } = result.summary;

      if (failed === 0) {
        setFeedback({
          severity: "success",
          message: `Updated ${updated} of ${total} master control${total === 1 ? "" : "s"}.`,
        });
        resetForm();
      } else if (updated === 0) {
        setFeedback({
          severity: "error",
          message: `Every row failed (${failed}/${total}). First error: ${
            result.results.find((r) => !r.success)?.error ?? "unknown"
          }`,
        });
      } else {
        setFeedback({
          severity: "info",
          message: `${updated} succeeded, ${failed} failed. Check each row individually for demo-only restrictions or validation errors.`,
        });
        resetForm();
      }
    } catch (err) {
      setFeedback({
        severity: "error",
        message:
          err instanceof Error
            ? err.message
            : "Bulk update failed. Please try again.",
      });
    }
  };

  const disabled = bulkUpdate.isPending || selectedIds.length === 0;

  return (
    <Box
      role="region"
      aria-label="Bulk edit selected master controls"
      sx={{
        position: "sticky",
        bottom: 0,
        zIndex: 10,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.primary.main}`,
        borderRadius: 1,
        boxShadow: "0 -4px 16px rgba(16, 24, 40, 0.08)",
        padding: "12px 16px",
      }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          gap={1}
        >
          <Stack direction="row" alignItems="center" gap={1}>
            <Wand2 size={16} color={theme.palette.primary.main} />
            <Typography fontSize={13} fontWeight={600}>
              {selectedIds.length} selected
            </Typography>
            <Typography fontSize={12} color={theme.palette.text.tertiary}>
              Choose the fields you want to apply to every selected master
              control. Changes propagate to mapped framework rows.
            </Typography>
          </Stack>
          <IconButton
            size="small"
            aria-label="Clear selection"
            onClick={onClearSelection}
          >
            <CloseIcon size={16} />
          </IconButton>
        </Stack>

        <Divider />

        <Stack
          direction="row"
          spacing={2}
          alignItems="flex-end"
          flexWrap="wrap"
          rowGap={2}
        >
          <Select
            id="bulk-edit-status"
            label="Status"
            value={status}
            items={statusItems}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setStatus(e.target.value as StatusValue)
            }
            sx={FIELD_SX}
            disabled={disabled}
          />
          <Select
            id="bulk-edit-owner"
            label="Owner"
            value={owner === "" ? "" : owner}
            items={[{ _id: "", name: "— keep existing —" }, ...userItems]}
            onChange={(e: SelectChangeEvent<string | number>) => {
              const raw = e.target.value;
              setOwner(raw === "" ? "" : Number(raw));
            }}
            sx={FIELD_SX}
            disabled={disabled}
          />
          <DatePicker
            label="Due date"
            date={dueDate}
            handleDateChange={(d) => setDueDate(d)}
            sx={FIELD_SX}
            disabled={disabled}
          />
          <CustomizableButton
            variant="contained"
            text={bulkUpdate.isPending ? "Applying…" : "Apply to selected"}
            onClick={handleApply}
            isDisabled={disabled}
            sx={{ minWidth: 180, height: 34 }}
          />
        </Stack>

        {feedback && (
          <Alert
            severity={feedback.severity}
            role={feedback.severity === "error" ? "alert" : "status"}
            sx={{ fontSize: 13 }}
          >
            {feedback.message}
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
