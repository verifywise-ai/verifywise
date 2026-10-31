import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Pencil } from "lucide-react";
import StandardModal from "../../../../components/Modals/StandardModal";
import Field from "../../../../components/Inputs/Field";
import Alert from "../../../../components/Alert";
import LifecyclePanel from "../../../../components/LifecycleTabs/LifecyclePanel";
import {
  lifecycleLabelSx,
  lifecycleValueSx,
} from "../../../../components/LifecycleTabs/lifecyclePanelStyles";
import { useAuth } from "../../../../../application/hooks/useAuth";
import {
  canEditUseCasesByRole,
  canManageLifecycle,
} from "../../../../../application/utils/useCaseLifecycle";
import { useMyPermissions } from "../../../../../application/hooks/useMyPermissions";
import {
  useUseCaseLifecycleActions,
  useUseCaseLifecycleSummary,
} from "../../../../../application/hooks/useUseCaseLifecycle";
import { LifecycleStage } from "../../../../../domain/enums/lifecycleStage.enum";
import { Project } from "../../../../../domain/types/Project";

/**
 * Lifecycle strip on the use case overview (#5187): the shared LifecyclePanel
 * plus the use case's department.
 */
const UseCaseLifecyclePanel = ({
  project,
  onChanged,
}: {
  project: Project;
  onChanged?: () => void;
}) => {
  const { userRoleName, userId } = useAuth();
  const { goLive, retire, confirm, setDepartment } = useUseCaseLifecycleActions(project.id);
  const { data: summary } = useUseCaseLifecycleSummary();

  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [department, setDepartmentDraft] = useState(project.department ?? "");
  const [error, setError] = useState<string | null>(null);

  // Same per-org permission matrix the server checks (custom roles included);
  // the built-in role rule only stands in until the list has loaded.
  const { permissions } = useMyPermissions();
  const canEditUseCases = permissions
    ? permissions.includes("useCase.edit")
    : canEditUseCasesByRole(userRoleName);
  const canManage = canManageLifecycle(userRoleName, userId, project.owner, canEditUseCases);
  const stage = project.lifecycle_stage ?? LifecycleStage.PLANNED;

  const saveDepartment = async () => {
    setError(null);
    try {
      await setDepartment.mutateAsync(department.trim() || null);
      setDepartmentOpen(false);
      onChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message || "The change could not be saved.");
    }
  };

  return (
    <>
      <LifecyclePanel
        testId="use-case-lifecycle-panel"
        stage={stage}
        goLiveDate={project.go_live_date}
        lastConfirmedAt={project.last_confirmed_at}
        retiredAt={project.retired_at}
        canManage={canManage}
        isStale={!!summary?.stale_ids.includes(project.id)}
        goLive={goLive}
        retire={retire}
        confirm={confirm}
        onChanged={onChanged}
        isBusy={setDepartment.isPending}
        copy={{
          staleMessage:
            "Nobody has confirmed this use case is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.",
          goLiveDescription:
            "Record the date this use case went into use. Owners are asked to confirm it is still live at the interval set in Settings.",
          retireTitle: "Retire use case",
          retireDescription:
            "A retired use case stays in the inventory under Retired, with its history, but is no longer checked for being live.",
        }}
        extraFields={
          <Stack sx={{ gap: "4px" }}>
            <Typography sx={lifecycleLabelSx}>Department</Typography>
            <Stack direction="row" alignItems="center" sx={{ gap: "4px" }}>
              <Typography sx={lifecycleValueSx}>{project.department || "Not set"}</Typography>
              {canManage && (
                <Box
                  component="button"
                  type="button"
                  aria-label="Edit department"
                  data-testid="lifecycle-edit-department"
                  onClick={() => {
                    setDepartmentDraft(project.department ?? "");
                    setError(null);
                    setDepartmentOpen(true);
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
        }
      />

      <StandardModal
        isOpen={departmentOpen}
        onClose={() => setDepartmentOpen(false)}
        title="Department"
        description="The team that runs this use case. Used to group live use cases on the dashboard."
        submitButtonText="Save"
        isSubmitting={setDepartment.isPending}
        isSubmitDisabled={department.trim().length > 255}
        onSubmit={() => void saveDepartment()}
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
    </>
  );
};

export default UseCaseLifecyclePanel;
