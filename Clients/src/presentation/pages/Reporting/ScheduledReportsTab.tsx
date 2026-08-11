/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { CalendarClock } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { text as textColors } from "../../themes/palette";
import Chip from "../../components/Chip";
import RowActionsButton from "../../components/IconButton";
import { EmptyState } from "../../components/EmptyState";
import TableEmptyStateLayout from "../../components/Table/TableEmptyStateLayout";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import {
  useScheduledReports,
  useRunNow,
  useSetActive,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
} from "../../../application/hooks/useReporting";
import { showAlert } from "../../../infrastructure/api/customAxios";

const FREQUENCIES = ["daily", "weekly", "monthly"];

const COLUMNS = ["Name", "Scope", "Next run", "Status", "Actions"];

// The runs table renders this column as "Organization"; the raw enum value
// would have the two tables disagree on the same word.
const scopeLabel = (scope: string) => (scope === "project" ? "Project" : "Organization");

const FREQUENCY_ITEMS = FREQUENCIES.map((f) => ({
  _id: f,
  name: f.charAt(0).toUpperCase() + f.slice(1),
}));

const FORMAT_ITEMS = [
  { _id: "pdf", name: "PDF" },
  { _id: "docx", name: "Word (DOCX)" },
];

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

  const onActionError = () => showAlert({ variant: "error", body: "Action failed", isToast: true });

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

  // Shared by the populated table and the empty layout, so the column row does
  // not drift between the two states.
  const tableHead = (
    <TableHead sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}>
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {COLUMNS.map((h) => (
          <TableCell key={h} sx={singleTheme.tableStyles.primary.header.cell} align="left">
            {h}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );

  if (!rows.length) {
    return (
      <TableEmptyStateLayout header={tableHead}>
        <EmptyState
          icon={CalendarClock}
          message="No scheduled reports yet. Create one from the Templates tab."
          showBorder
        />
      </TableEmptyStateLayout>
    );
  }

  const bodyCell = singleTheme.tableStyles.primary.body.cell;

  return (
    <>
      <TableContainer sx={singleTheme.tableStyles.primary.frame}>
        <Table>
          {tableHead}
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id} sx={singleTheme.tableStyles.primary.body.row}>
                <TableCell sx={{ ...bodyCell, color: textColors.primary }}>{r.name}</TableCell>
                <TableCell sx={{ ...bodyCell, color: textColors.secondary }}>
                  {scopeLabel(r.scope)}
                </TableCell>
                <TableCell sx={{ ...bodyCell, color: textColors.secondary }}>
                  {r.next_run_at ? new Date(r.next_run_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell sx={bodyCell}>
                  <Chip
                    label={r.is_active ? "Active" : "Paused"}
                    variant={r.is_active ? "success" : "default"}
                    size="small"
                    uppercase={false}
                  />
                </TableCell>
                {/* The shared row-actions menu every other table uses. */}
                <TableCell sx={bodyCell}>
                  <RowActionsButton
                    id={r.id}
                    type="scheduledReport"
                    isPaused={!r.is_active}
                    onRunNow={() => runNow.mutate(r.id, { onError: onActionError })}
                    onToggleEnable={async () =>
                      setActive.mutate(
                        { id: r.id, active: !r.is_active },
                        { onError: onActionError },
                      )
                    }
                    onEdit={() => openEdit(r)}
                    onDelete={() => deleteReport.mutate(r.id, { onError: onActionError })}
                    warningTitle="Delete scheduled report"
                    warningMessage={`"${r.name}" will stop running and be removed from this list. This cannot be undone.`}
                  />
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
            <Field
              id="scheduled-report-name"
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Select
              id="scheduled-report-format"
              label="Format"
              value={draft.format}
              items={FORMAT_ITEMS}
              onChange={(e) => setDraft({ ...draft, format: e.target.value as "pdf" | "docx" })}
              getOptionValue={(item) => item._id}
            />
            <Select
              id="scheduled-report-frequency"
              label="Frequency"
              value={draft.schedule.frequency}
              items={FREQUENCY_ITEMS}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  schedule: { ...draft.schedule, frequency: String(e.target.value) },
                })
              }
              getOptionValue={(item) => item._id}
            />
            <Stack direction="row" spacing={6}>
              <Field
                id="scheduled-report-hour"
                type="number"
                label="Hour"
                value={draft.schedule.hour}
                min={0}
                max={23}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: { ...draft.schedule, hour: Number(e.target.value) },
                  })
                }
              />
              <Field
                id="scheduled-report-minute"
                type="number"
                label="Minute"
                value={draft.schedule.minute}
                min={0}
                max={59}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: { ...draft.schedule, minute: Number(e.target.value) },
                  })
                }
              />
              <Field
                id="scheduled-report-timezone"
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
    </>
  );
}
