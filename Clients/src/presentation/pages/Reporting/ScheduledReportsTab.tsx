/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  TextField,
  MenuItem,
} from "@mui/material";
import { CalendarClock } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { text as textColors, status } from "../../themes/palette";
import Chip from "../../components/Chip";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import StandardModal from "../../components/Modals/StandardModal";
import {
  useScheduledReports,
  useRunNow,
  useSetActive,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
} from "../../../application/hooks/useReporting";
import { showAlert } from "../../../infrastructure/api/customAxios";

const FREQUENCIES = ["daily", "weekly", "monthly"];

// The three fields worth editing in place. Scope, sections and AI blocks stay
// in the create wizard — changing those is a different report, not an edit.
type Draft = {
  id: number;
  name: string;
  format: "pdf" | "docx";
  schedule: { frequency: string; hour: number; minute: number; timezone: string };
};

export default function ScheduledReportsTab() {
  const { data: rows = [] } = useScheduledReports();
  const runNow = useRunNow();
  const setActive = useSetActive();
  const updateReport = useUpdateScheduledReport();
  const deleteReport = useDeleteScheduledReport();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<any>(null);

  const onActionError = () =>
    showAlert({ variant: "error", body: "Action failed", isToast: true });

  const openEdit = (r: any) =>
    setDraft({
      id: r.id,
      name: r.name ?? "",
      format: r.format === "docx" ? "docx" : "pdf",
      schedule: {
        frequency: "daily",
        hour: 9,
        minute: 0,
        timezone: "UTC",
        ...(r.schedule_config ?? {}),
      },
    });

  const submitEdit = () => {
    if (!draft) return;
    updateReport.mutate(
      {
        id: draft.id,
        // scheduleConfig always goes along: the backend recomputes next_run_at
        // only when it is present, and the hook's invalidate refreshes the row.
        body: { name: draft.name, format: draft.format, scheduleConfig: draft.schedule },
      },
      { onSuccess: () => setDraft(null), onError: onActionError },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteReport.mutate(pendingDelete.id, {
      onSuccess: () => setPendingDelete(null),
      onError: onActionError,
    });
  };

  if (!rows.length) {
    return (
      <EmptyState
        icon={CalendarClock}
        message="No scheduled reports yet. Create one from the Templates tab."
        showBorder
      />
    );
  }

  return (
    <>
      <TableContainer sx={singleTheme.tableStyles.primary.frame}>
        <Table>
          <TableHead>
            <TableRow sx={singleTheme.tableStyles.primary.header.row}>
              {["Name", "Scope", "Next run", "Status", "Actions"].map((h) => (
                <TableCell key={h} sx={singleTheme.tableStyles.primary.header.cell}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id} sx={singleTheme.tableStyles.primary.body.row}>
                <TableCell
                  sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.primary }}
                >
                  {r.name}
                </TableCell>
                <TableCell
                  sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.secondary }}
                >
                  {r.scope}
                </TableCell>
                <TableCell
                  sx={{ ...singleTheme.tableStyles.primary.body.cell, color: textColors.secondary }}
                >
                  {r.next_run_at ? new Date(r.next_run_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  <Chip
                    label={r.is_active ? "Active" : "Paused"}
                    variant={r.is_active ? "success" : "default"}
                    size="small"
                    uppercase={false}
                  />
                </TableCell>
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  <Stack direction="row" spacing="8px">
                    <CustomizableButton
                      variant="text"
                      text="Run now"
                      onClick={() => runNow.mutate(r.id, { onError: onActionError })}
                      sx={{ height: 28, fontSize: 13, minWidth: 0 }}
                    />
                    <CustomizableButton
                      variant="text"
                      text={r.is_active ? "Pause" : "Resume"}
                      onClick={() =>
                        setActive.mutate({ id: r.id, active: !r.is_active }, { onError: onActionError })
                      }
                      sx={{ height: 28, fontSize: 13, minWidth: 0 }}
                    />
                    <CustomizableButton
                      variant="text"
                      text="Edit"
                      onClick={() => openEdit(r)}
                      sx={{ height: 28, fontSize: 13, minWidth: 0 }}
                    />
                    <CustomizableButton
                      variant="text"
                      text="Delete"
                      onClick={() => setPendingDelete(r)}
                      sx={{ height: 28, fontSize: 13, minWidth: 0, color: status.error.text }}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {draft && (
        <StandardModal
          isOpen
          onClose={() => setDraft(null)}
          title="Edit scheduled report"
          description="Update the name, output format and delivery schedule."
          onSubmit={submitEdit}
          submitButtonText="Save"
          isSubmitting={updateReport.isPending}
        >
          <Stack spacing={6}>
            <TextField
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <TextField
              select
              label="Format"
              value={draft.format}
              onChange={(e) =>
                setDraft({ ...draft, format: e.target.value as "pdf" | "docx" })
              }
            >
              <MenuItem value="pdf">PDF</MenuItem>
              <MenuItem value="docx">Word (DOCX)</MenuItem>
            </TextField>
            <TextField
              select
              label="Frequency"
              value={draft.schedule.frequency}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  schedule: { ...draft.schedule, frequency: e.target.value },
                })
              }
            >
              {FREQUENCIES.map((f) => (
                <MenuItem key={f} value={f}>
                  {f}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField
                type="number"
                label="Hour"
                value={draft.schedule.hour}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: { ...draft.schedule, hour: Number(e.target.value) },
                  })
                }
                inputProps={{ min: 0, max: 23 }}
              />
              <TextField
                type="number"
                label="Minute"
                value={draft.schedule.minute}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: { ...draft.schedule, minute: Number(e.target.value) },
                  })
                }
                inputProps={{ min: 0, max: 59 }}
              />
              <TextField
                label="Timezone"
                value={draft.schedule.timezone}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: { ...draft.schedule, timezone: e.target.value },
                  })
                }
              />
            </Stack>
          </Stack>
        </StandardModal>
      )}

      {pendingDelete && (
        <StandardModal
          isOpen
          onClose={() => setPendingDelete(null)}
          title="Delete scheduled report"
          description={`"${pendingDelete.name}" will stop running and be removed from this list. This cannot be undone.`}
          onSubmit={confirmDelete}
          submitButtonText="Delete report"
          submitButtonColor={status.error.text}
          isSubmitting={deleteReport.isPending}
        />
      )}
    </>
  );
}
