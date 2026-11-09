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
import { fill } from "../../../../i18n/fill";

interface UseCaseOption {
  id: number;
  label: string;
}

/** AI app detail section: the use cases this app serves (#5259). */
export default function AIAppLinkedUseCases({ appId }: { appId: number }) {
  const { t } = useTranslation();
  const canEdit = useCanEditAiApps();
  const { data } = useAiAppUseCases(appId);
  const linkMutation = useLinkUseCaseToAiApp(appId);
  const unlinkMutation = useUnlinkUseCaseFromAiApp(appId);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selected, setSelected] = useState<UseCaseOption | null>(null);
  const [alert, setAlert] = useState<{ variant: "success"; body: string } | null>(null);
  const { data: projects } = useProjects({ enabled: isAddOpen });

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  const useCases = useMemo(() => data?.use_cases ?? [], [data]);
  const hiddenCount = data?.hidden_count ?? 0;
  const isBusy = linkMutation.isPending || unlinkMutation.isPending;

  const options = useMemo<UseCaseOption[]>(() => {
    const linked = new Set(useCases.map((useCase) => useCase.id));
    return (projects ?? [])
      .filter((project) => !project.is_organizational && !linked.has(project.id))
      .map((project) => ({
        id: project.id,
        label: project.uc_id
          ? `${project.uc_id} - ${project.project_title}`
          : project.project_title,
      }));
  }, [projects, useCases]);

  // Failures reach the user through customAxios' error toast.
  const handleAdd = async () => {
    if (!selected) return;
    try {
      await linkMutation.mutateAsync(selected.id);
      setIsAddOpen(false);
      setAlert({ variant: "success", body: "Use case linked" });
    } catch {
      setIsAddOpen(true);
    }
  };

  const handleRemove = async (projectId: number) => {
    try {
      await unlinkMutation.mutateAsync(projectId);
      setAlert({ variant: "success", body: "Use case removed" });
    } catch {
      setAlert(null);
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
          placeholder={
            options.length === 0 ? "All use cases are already linked" : "Select a use case"
          }
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
