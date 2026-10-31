import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { Pencil } from "lucide-react";
import StatusBadge from "../../../../components/StatusBadge";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import StandardModal from "../../../../components/Modals/StandardModal";
import DatePicker from "../../../../components/Inputs/Datepicker";
import Field from "../../../../components/Inputs/Field";
import Alert from "../../../../components/Alert";
import { useAuth } from "../../../../../application/hooks/useAuth";
import useFormattedDate from "../../../../../application/hooks/useFormattedDate";
import {
  canEditUseCasesByRole,
  canManageUseCaseLifecycle,
} from "../../../../../application/utils/useCaseLifecycle";
import { useMyPermissions } from "../../../../../application/hooks/useMyPermissions";
import {
  useUseCaseLifecycleActions,
  useUseCaseLifecycleSummary,
} from "../../../../../application/hooks/useUseCaseLifecycle";
import {
  LIFECYCLE_STAGE_LABELS,
  LifecycleStage,
} from "../../../../../domain/enums/lifecycleStage.enum";
import { Project } from "../../../../../domain/types/Project";
import { border } from "../../../../themes/palette";

const STAGE_VARIANT = {
  [LifecycleStage.IN_REVIEW]: "warning",
  [LifecycleStage.PLANNED]: "info",
  [LifecycleStage.LIVE]: "success",
  [LifecycleStage.RETIRED]: "default",
} as const;

type Modal = "go-live" | "retire" | "department" | null;

const labelSx = { fontSize: 12, color: "text.secondary" };
const valueSx = { fontSize: 13, color: "text.primary", fontWeight: 500 };

/**
 * Lifecycle strip on the use case overview (#5187): stage, dates, department
 * and the owner actions (mark as live, confirm still live, retire).
 */
const UseCaseLifecyclePanel = ({
  project,
  onChanged,
}: {
  project: Project;
  onChanged?: () => void;
}) => {
  const formatDate = useFormattedDate();
  const { userRoleName, userId } = useAuth();
  const { goLive, retire, confirm, setDepartment } = useUseCaseLifecycleActions(project.id);
  const { data: summary } = useUseCaseLifecycleSummary();

  const [modal, setModal] = useState<Modal>(null);
  const [goLiveDate, setGoLiveDate] = useState<Dayjs | null>(dayjs());
  const [department, setDepartmentDraft] = useState(project.department ?? "");
  const [error, setError] = useState<string | null>(null);

  const stage = project.lifecycle_stage ?? LifecycleStage.PLANNED;
  // Same per-org permission matrix the server checks (custom roles included);
  // the built-in role rule only stands in until the list has loaded.
  const { permissions } = useMyPermissions();
  const canEditUseCases = permissions
    ? permissions.includes("useCase.edit")
    : canEditUseCasesByRole(userRoleName);
  const canManage = canManageUseCaseLifecycle(userRoleName, userId, project.owner, canEditUseCases);
  const isStale = stage === LifecycleStage.LIVE && !!summary?.stale_ids.includes(project.id);
  const busy = goLive.isPending || retire.isPending || confirm.isPending || setDepartment.isPending;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      setModal(null);
      onChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message || "The change could not be saved.");
    }
  };

  const goLiveDateError =
    goLiveDate && goLiveDate.isAfter(dayjs(), "day")
      ? "The go-live date can't be later than today"
      : "";

  return (
    <Box
      data-testid="use-case-lifecycle-panel"
      sx={{
        border: `1px solid ${border.dark}`,
        borderRadius: "4px",
        p: "16px",
        mb: "24px",
        backgroundColor: "background.main",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        sx={{ gap: "16px" }}
      >
        <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: "24px" }}>
          <Stack sx={{ gap: "4px" }}>
            <Typography sx={labelSx}>Lifecycle</Typography>
            <StatusBadge
              label={LIFECYCLE_STAGE_LABELS[stage]}
              variant={STAGE_VARIANT[stage]}
              size="small"
              uppercase={false}
            />
          </Stack>
          {project.go_live_date && (
            <Stack sx={{ gap: "4px" }}>
              <Typography sx={labelSx}>Go-live date</Typography>
              <Typography sx={valueSx}>{formatDate(project.go_live_date)}</Typography>
            </Stack>
          )}
          {stage === LifecycleStage.LIVE && (
            <Stack sx={{ gap: "4px" }}>
              <Typography sx={labelSx}>Last confirmed live</Typography>
              <Typography sx={valueSx}>
                {project.last_confirmed_at ? formatDate(project.last_confirmed_at) : "Not yet"}
              </Typography>
            </Stack>
          )}
          {stage === LifecycleStage.RETIRED && project.retired_at && (
            <Stack sx={{ gap: "4px" }}>
              <Typography sx={labelSx}>Retired on</Typography>
              <Typography sx={valueSx}>{formatDate(project.retired_at)}</Typography>
            </Stack>
          )}
          <Stack sx={{ gap: "4px" }}>
            <Typography sx={labelSx}>Department</Typography>
            <Stack direction="row" alignItems="center" sx={{ gap: "4px" }}>
              <Typography sx={valueSx}>{project.department || "Not set"}</Typography>
              {canManage && (
                <Box
                  component="button"
                  type="button"
                  aria-label="Edit department"
                  data-testid="lifecycle-edit-department"
                  onClick={() => {
                    setDepartmentDraft(project.department ?? "");
                    setError(null);
                    setModal("department");
                  }}
                  sx={{
                    display: "inline-flex",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    p: "2px",
                    color: "text.secondary",
                  }}
                >
                  <Pencil size={14} strokeWidth={1.5} />
                </Box>
              )}
            </Stack>
          </Stack>
        </Stack>

        {canManage && (
          <Stack direction="row" sx={{ gap: "8px" }}>
            {stage === LifecycleStage.PLANNED && (
              <CustomizableButton
                variant="contained"
                text="Mark as live"
                testId="lifecycle-go-live-btn"
                isDisabled={busy}
                onClick={() => {
                  setGoLiveDate(dayjs());
                  setError(null);
                  setModal("go-live");
                }}
              />
            )}
            {stage === LifecycleStage.LIVE && (
              <CustomizableButton
                variant="contained"
                text="Confirm still live"
                testId="lifecycle-confirm-btn"
                isDisabled={busy}
                onClick={() => run(() => confirm.mutateAsync())}
              />
            )}
            {(stage === LifecycleStage.PLANNED || stage === LifecycleStage.LIVE) && (
              <CustomizableButton
                variant="outlined"
                text="Retire"
                testId="lifecycle-retire-btn"
                isDisabled={busy}
                onClick={() => {
                  setError(null);
                  setModal("retire");
                }}
              />
            )}
          </Stack>
        )}
      </Stack>

      {isStale && (
        <Box sx={{ mt: "16px" }}>
          <Alert
            variant="warning"
            body="Nobody has confirmed this use case is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use."
            isToast={false}
            sx={{ position: "static" }}
          />
        </Box>
      )}
      {error && !modal && (
        <Box sx={{ mt: "16px" }}>
          <Alert variant="error" body={error} isToast={false} sx={{ position: "static" }} />
        </Box>
      )}

      <StandardModal
        isOpen={modal === "go-live"}
        onClose={() => setModal(null)}
        title="Mark as live"
        description="Record the date this use case went into use. Owners are asked to confirm it is still live at the interval set in Settings."
        submitButtonText="Mark as live"
        isSubmitting={goLive.isPending}
        isSubmitDisabled={!goLiveDate || !!goLiveDateError}
        onSubmit={() => {
          // The user's local calendar date, never a UTC conversion.
          if (goLiveDate) void run(() => goLive.mutateAsync(goLiveDate.format("YYYY-MM-DD")));
        }}
      >
        <Stack sx={{ gap: "16px" }}>
          <DatePicker
            label="Go-live date"
            isRequired
            date={goLiveDate}
            handleDateChange={(value) => setGoLiveDate(value)}
            error={goLiveDateError}
          />
          {error && (
            <Alert variant="error" body={error} isToast={false} sx={{ position: "static" }} />
          )}
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={modal === "retire"}
        onClose={() => setModal(null)}
        title="Retire use case"
        description="A retired use case stays in the inventory under Retired, with its history, but is no longer checked for being live."
        submitButtonText="Retire"
        isSubmitting={retire.isPending}
        onSubmit={() => run(() => retire.mutateAsync())}
      >
        {error ? (
          <Alert variant="error" body={error} isToast={false} sx={{ position: "static" }} />
        ) : null}
      </StandardModal>

      <StandardModal
        isOpen={modal === "department"}
        onClose={() => setModal(null)}
        title="Department"
        description="The team that runs this use case. Used to group live use cases on the dashboard."
        submitButtonText="Save"
        isSubmitting={setDepartment.isPending}
        isSubmitDisabled={department.trim().length > 255}
        onSubmit={() => run(() => setDepartment.mutateAsync(department.trim() || null))}
      >
        <Stack sx={{ gap: "16px" }}>
          <Field
            id="use-case-department"
            label="Department"
            value={department}
            onChange={(event) => setDepartmentDraft(event.target.value)}
            placeholder="For example, Finance"
            isOptional
          />
          {error && (
            <Alert variant="error" body={error} isToast={false} sx={{ position: "static" }} />
          )}
        </Stack>
      </StandardModal>
    </Box>
  );
};

export default UseCaseLifecyclePanel;
