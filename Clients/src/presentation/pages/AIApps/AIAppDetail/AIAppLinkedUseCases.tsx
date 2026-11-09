import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { CirclePlus, FolderTree, X } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import AutoCompleteField from "../../../components/Inputs/Autocomplete";
import StandardModal from "../../../components/Modals/StandardModal";
import Alert from "../../../components/Alert";
import Chip from "../../../components/Chip";
import { palette } from "../../../themes/palette";
import {
  useAiAppUseCases,
  useLinkUseCaseToAiApp,
  useUnlinkUseCaseFromAiApp,
} from "../../../../application/hooks/useAiApps";
import { useCanEditAiApps } from "../../../../application/hooks/useCanEditAiApps";
import { useProjects } from "../../../../application/hooks/useProjects";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { isClientError } from "../../../../application/utils/apiErrorReason";
import { fill } from "../../../../i18n/fill";

interface UseCaseOption {
  id: number;
  label: string;
}

/** AI app detail section: the use cases this app serves (#5259). */
export default function AIAppLinkedUseCases({ appId }: { appId: number }) {
  const { t } = useTranslation();
  const canEdit = useCanEditAiApps();
  const { data, refetch } = useAiAppUseCases(appId);
  const linkMutation = useLinkUseCaseToAiApp(appId);
  const unlinkMutation = useUnlinkUseCaseFromAiApp(appId);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selected, setSelected] = useState<UseCaseOption | null>(null);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const {
    approvedProjects,
    isLoading: projectsLoading,
    isError: projectsFailed,
  } = useProjects({ enabled: isAddOpen });

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  const useCases = useMemo(() => data?.use_cases ?? [], [data]);
  const hiddenCount = data?.hidden_count ?? 0;
  const isBusy = linkMutation.isPending || unlinkMutation.isPending;

  const linkable = useMemo(
    () => approvedProjects.filter((project) => !project.is_organizational),
    [approvedProjects],
  );

  const options = useMemo<UseCaseOption[]>(() => {
    const linked = new Set(useCases.map((useCase) => useCase.id));
    return linkable
      .filter((project) => !linked.has(project.id))
      .map((project) => ({
        id: project.id,
        label: project.uc_id
          ? `${project.uc_id} - ${project.project_title}`
          : project.project_title,
      }));
  }, [linkable, useCases]);

  const pickerPlaceholder = () => {
    if (projectsLoading) return "Loading use cases...";
    if (projectsFailed) return "Could not load use cases";
    if (linkable.length === 0) return "No use cases can be linked yet";
    if (options.length === 0) return "All use cases are already linked";
    return "Select a use case";
  };

  /** customAxios toasts every failure except a 404, which only this screen can report. */
  const reportIfGone = (error: unknown, body: string) => {
    if (isClientError(error) && error.status === 404) {
      setAlert({ variant: "error", body });
      refetch();
    }
  };

  const handleAdd = async () => {
    if (!selected) return;
    try {
      await linkMutation.mutateAsync(selected.id);
      setIsAddOpen(false);
      setAlert({ variant: "success", body: "Use case linked" });
    } catch (error) {
      reportIfGone(error, "This use case or AI app is no longer available");
    }
  };

  const handleRemove = async (projectId: number) => {
    try {
      await unlinkMutation.mutateAsync(projectId);
      setAlert({ variant: "success", body: "Use case removed" });
    } catch (error) {
      reportIfGone(error, "This use case is no longer linked");
    }
  };

  return (
    <Box data-testid="ai-app-linked-use-cases">
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
        sx={{ mb: "16px" }}
      >
        <Stack direction="row" alignItems="center" gap="8px">
          <FolderTree size={16} strokeWidth={1.5} color={palette.text.secondary} />
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Linked use cases</Typography>
        </Stack>
        {canEdit && (
          <CustomizableButton
            text="Add use case"
            variant="contained"
            icon={<CirclePlus size={14} strokeWidth={1.5} />}
            onClick={() => {
              setSelected(null);
              setIsAddOpen(true);
            }}
            disabled={isBusy}
            testId="ai-app-add-use-case"
          />
        )}
      </Stack>

      {useCases.length > 0 && (
        <Stack direction="row" gap="8px" sx={{ flexWrap: "wrap" }}>
          {useCases.map((useCase) => (
            <Stack key={useCase.id} direction="row" alignItems="center" gap="2px">
              <Box
                component={Link}
                to={`/project-view?projectId=${useCase.id}`}
                data-testid={`linked-use-case-${useCase.id}`}
                sx={{ textDecoration: "none", display: "inline-flex" }}
              >
                <Chip
                  label={
                    useCase.uc_id
                      ? `${useCase.uc_id} - ${useCase.project_title}`
                      : useCase.project_title
                  }
                  size="small"
                  uppercase={false}
                />
              </Box>
              {canEdit && (
                <IconButton
                  size="small"
                  onClick={() => handleRemove(useCase.id)}
                  disabled={isBusy}
                  aria-label={fill(t("Remove {name}"), { name: useCase.project_title })}
                >
                  <X size={14} strokeWidth={1.5} color={palette.text.tertiary} />
                </IconButton>
              )}
            </Stack>
          ))}
        </Stack>
      )}

      {useCases.length === 0 && hiddenCount === 0 && (
        <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
          No use cases are linked to this AI app yet.
        </Typography>
      )}

      {hiddenCount > 0 && (
        <Typography
          sx={{
            fontSize: 13,
            color: palette.text.secondary,
            mt: useCases.length > 0 ? "12px" : 0,
          }}
          data-testid="ai-app-hidden-use-cases"
        >
          {hiddenCount === 1
            ? t("1 more linked use case you do not have access to")
            : fill(t("{count} more linked use cases you do not have access to"), {
                count: hiddenCount,
              })}
        </Typography>
      )}

      <StandardModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add use case"
        description="Select the use case this AI app serves."
        onSubmit={handleAdd}
        submitButtonText="Add"
        isSubmitting={linkMutation.isPending}
        isSubmitDisabled={!selected}
        maxWidth="480px"
      >
        <AutoCompleteField<UseCaseOption, false>
          label="Use case"
          placeholder={pickerPlaceholder()}
          options={options}
          value={selected}
          onChange={(_event, value) => setSelected(value as UseCaseOption | null)}
          getOptionLabel={(option) => option.label}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          disabled={options.length === 0}
        />
      </StandardModal>

      {alert && (
        <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
      )}
    </Box>
  );
}
