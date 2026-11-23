/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
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
  useScheduledReport,
  useRunNow,
  useSetActive,
  useUpdateScheduledReport,
  useDeleteScheduledReport,
} from "../../../application/hooks/useReporting";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { showAlert } from "../../../infrastructure/api/customAxios";
import { FREQUENCY_ITEMS, MONTH_ITEMS, withFrequency } from "./scheduleOptions";
import ReportDetailsStep from "./ReportDetailsStep";
import {
  PERIOD_KEYS,
  buildParameterPrefill,
  declaredFields,
  reportRequestErrorMessage,
  todayIso,
  toRequestParameters,
  validateParameters,
} from "./reportParameters";
import type { ReportParameters } from "../../../domain/interfaces/i.reporting";

const COLUMNS = ["Name", "Scope", "Next run", "Status", "Actions"];

// The runs table renders this column as "Organization"; the raw enum value
// would have the two tables disagree on the same word.
const scopeLabel = (scope: string) => (scope === "project" ? "Project" : "Organization");

const FORMAT_ITEMS = [
  { _id: "pdf", name: "PDF" },
  { _id: "docx", name: "Word (DOCX)" },
];

// The fields worth editing in place: name, format and schedule here, plus the
// report details (report_parameters) the schedule's template version declares,
// kept apart in parameterEdits. Scope, sections and AI blocks stay in the
// create wizard — changing those is a different report, not an edit.
type Draft = {
  id: number;
  name: string;
  format: "pdf" | "docx";
  schedule: {
    frequency: string;
    hour: number;
    minute: number;
    timezone: string;
    anchorMonth?: number;
  };
};

export default function ScheduledReportsTab() {
  const { data: rows = [] } = useScheduledReports();
  const formatDate = useFormattedDate();
  const runNow = useRunNow();
  const setActive = useSetActive();
  const updateReport = useUpdateScheduledReport();
  const deleteReport = useDeleteScheduledReport();
  const [draft, setDraft] = useState<Draft | null>(null);

  // Report details: the legacy list does not carry the version's declared
  // fields, so the dialog loads the schedule itself. Edits win over the stored
  // answers; errors show on edited fields, or on all of them after a Save
  // attempt, as in the run wizard.
  const detail = useScheduledReport(draft?.id);
  const [parameterEdits, setParameterEdits] = useState<ReportParameters>({});
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [saveAttempted, setSaveAttempted] = useState(false);
  const declared = detail.data?.parameters_config?.fields;
  // Period fields are never stored on a schedule (each run derives them), so a
  // version declaring only those has nothing to edit here.
  const fields = useMemo(() => declaredFields(declared), [declared]);
  const hasDetails = fields.some((f) => !PERIOD_KEYS.includes(f.key));
  const today = todayIso();
  const storedParameters = detail.data?.report_parameters;
  const prefill = useMemo(
    () =>
      buildParameterPrefill(fields, {
        last: { parameters: storedParameters ?? {}, periodEnd: null },
        organizationName: "",
        userFullName: "",
        today,
      }),
    [fields, storedParameters, today],
  );
  const parameterValues = { ...prefill, ...parameterEdits };
  const parameterErrors = hasDetails
    ? validateParameters(fields, parameterValues, { today, requirePeriod: false })
    : {};
  const shownParameterErrors = saveAttempted
    ? parameterErrors
    : Object.fromEntries(Object.entries(parameterErrors).filter(([key]) => touched.has(key)));
  const setParameter = (key: string, value: string | boolean) => {
    setParameterEdits((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => new Set(prev).add(key));
  };
  // Until the schedule has loaded it is unknown whether it declares details,
  // and a Save then could not send them. A failed load leaves the stored
  // answers untouched (no reportParameters is sent), so Save stays available.
  const detailsLoading = draft != null && detail.isFetching;
  const draftId = draft?.id;
  const detailFailed = detail.isError;
  useEffect(() => {
    if (draftId != null && detailFailed) {
      showAlert({
        variant: "error",
        body: "Could not load the report details. Other changes can still be saved.",
        isToast: true,
      });
    }
  }, [draftId, detailFailed]);

  const onActionError = () => showAlert({ variant: "error", body: "Action failed", isToast: true });

  const openEdit = (r: any) => {
    setParameterEdits({});
    setTouched(new Set());
    setSaveAttempted(false);
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
  };

  const submitEdit = () => {
    if (!draft || detailsLoading) return;
    if (hasDetails && Object.keys(parameterErrors).length > 0) {
      setSaveAttempted(true);
      return;
    }
    updateReport.mutate(
      {
        id: draft.id,
        // scheduleConfig always goes along: the backend recomputes next_run_at
        // only when it is present, and the hook's invalidate refreshes the row.
        // reportParameters only for a version that declares details: the
        // server rejects answers a template does not ask for.
        body: {
          name: draft.name,
          format: draft.format,
          scheduleConfig: draft.schedule,
          ...(hasDetails
            ? { reportParameters: toRequestParameters(fields, parameterValues, false) }
            : {}),
        },
      },
      {
        onSuccess: () => setDraft(null),
        // A 400 here names the problem (e.g. a day of month past 28 on a
        // quarterly schedule), so show the server's words.
        onError: (error) =>
          showAlert({
            variant: "error",
            body: reportRequestErrorMessage(error, "Action failed"),
            isToast: true,
          }),
      },
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
                  {r.next_run_at ? formatDate(new Date(r.next_run_at), { includeTime: true }) : "—"}
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
          description={
            hasDetails
              ? "Update the name, output format, delivery schedule and report details."
              : "Update the name, output format and delivery schedule."
          }
          onSubmit={submitEdit}
          submitButtonText="Save"
          isSubmitting={updateReport.isPending}
          isSubmitDisabled={detailsLoading}
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
                  schedule: withFrequency(draft.schedule, String(e.target.value)),
                })
              }
              getOptionValue={(item) => item._id}
            />
            {draft.schedule.frequency === "quarterly" && (
              <Select
                id="scheduled-report-anchor-month"
                label="Run in month"
                value={String(draft.schedule.anchorMonth)}
                items={MONTH_ITEMS}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: { ...draft.schedule, anchorMonth: Number(e.target.value) },
                  })
                }
                getOptionValue={(item) => item._id}
              />
            )}
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
            {hasDetails && (
              <ReportDetailsStep
                fields={fields}
                values={parameterValues}
                errors={shownParameterErrors}
                onChange={setParameter}
                mode="schedule"
                frequency={draft.schedule.frequency}
              />
            )}
          </Stack>
        </StandardModal>
      )}
    </>
  );
}
