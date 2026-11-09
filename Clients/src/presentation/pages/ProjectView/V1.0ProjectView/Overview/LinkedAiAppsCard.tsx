import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Box, Stack, Typography } from "@mui/material";
import { Bot, CirclePlus } from "lucide-react";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import StandardModal from "../../../../components/Modals/StandardModal";
import Field from "../../../../components/Inputs/Field";
import Alert from "../../../../components/Alert";
import Chip from "../../../../components/Chip";
import {
  descCardbodyStyle,
  infoCardStyle,
  infoCardTitleStyle,
} from "../../../../components/Cards/DescriptionCard/style";
import { palette } from "../../../../themes/palette";
import {
  useCreateAiAppFromUseCase,
  useCreateAiAppPreview,
  useProjectAiApps,
} from "../../../../../application/hooks/useAiApps";
import { useCanEditAiApps } from "../../../../../application/hooks/useCanEditAiApps";
import { useTranslation } from "../../../../../application/hooks/useTranslation";
import {
  getClientErrorReason,
  isClientError,
} from "../../../../../application/utils/apiErrorReason";
import { fill } from "../../../../../i18n/fill";
import { Project } from "../../../../../domain/types/Project";

const NAME_MAX_LENGTH = 255;

/** Overview card: the AI apps a use case feeds, and creating one from it (#5259). */
const LinkedAiAppsCard = ({ project }: { project: Project }) => {
  const { t } = useTranslation();
  const canEdit = useCanEditAiApps();
  const { data: aiApps = [] } = useProjectAiApps(project.id);
  const [isOpen, setIsOpen] = useState(false);
  const { data: preview } = useCreateAiAppPreview(project.id, isOpen);
  const createMutation = useCreateAiAppFromUseCase(project.id);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  const isSettled = project.approval_status !== "pending" && project.approval_status !== "rejected";
  const callerBecomesOwner = preview?.caller_becomes_owner ?? false;

  const openModal = () => {
    setName(project.project_title ?? "");
    setNameError(undefined);
    setIsOpen(true);
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("AI app name is required"));
      return;
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      setNameError(t("AI app name must be 255 characters or fewer"));
      return;
    }
    setNameError(undefined);
    try {
      await createMutation.mutateAsync(trimmed);
      setIsOpen(false);
      setAlert({ variant: "success", body: "AI app created from this use case" });
    } catch (error) {
      if (isClientError(error) && error.status === 409) {
        setNameError(getClientErrorReason(error) ?? t("An AI app with this name already exists"));
        return;
      }
      // customAxios toasts every other failure, but never a 404.
      if (isClientError(error) && error.status === 404) {
        setAlert({ variant: "error", body: "This use case is no longer available" });
      }
    }
  };

  const copiedLine = () => {
    if (!preview) return t("Copies the description and the linked models.");
    const count = preview.model_count;
    if (callerBecomesOwner) {
      return count === 1
        ? t("Copies the description and 1 linked model.")
        : fill(t("Copies the description and {count} linked models."), { count });
    }
    return count === 1
      ? t("Copies the description, the owner and 1 linked model.")
      : fill(t("Copies the description, the owner and {count} linked models."), { count });
  };

  return (
    <Stack sx={{ ...infoCardStyle, mb: "20px", width: "auto" }} data-testid="linked-ai-apps-card">
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        gap="12px"
        sx={{ flexWrap: "wrap" }}
      >
        <Stack gap="4px" sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={infoCardTitleStyle}>Linked AI apps</Typography>
          {aiApps.length > 0 ? (
            <Stack direction="row" gap="8px" sx={{ flexWrap: "wrap" }}>
              {aiApps.map((app) => (
                <Box
                  key={app.id}
                  component={Link}
                  to={`/ai-apps/${app.id}`}
                  data-testid={`linked-ai-app-${app.id}`}
                  sx={{ textDecoration: "none", display: "inline-flex" }}
                >
                  <Chip label={app.name} size="small" uppercase={false} />
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography sx={descCardbodyStyle}>
              No AI apps are linked to this use case yet.
            </Typography>
          )}
        </Stack>
        {canEdit && isSettled && (
          <CustomizableButton
            text="Create AI app from this use case"
            variant="outlined"
            icon={<CirclePlus size={14} strokeWidth={1.5} />}
            onClick={openModal}
            testId="create-ai-app-from-use-case"
          />
        )}
      </Stack>

      <StandardModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Create AI app"
        description="Start a draft AI app from this use case and link the two."
        onSubmit={handleSubmit}
        submitButtonText="Create AI app"
        isSubmitting={createMutation.isPending}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Field
            id="ai-app-name"
            label="AI app name"
            isRequired
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
            }}
            error={nameError}
            disabled={createMutation.isPending}
            dataTestId="create-ai-app-name"
          />
          <Stack direction="row" gap="8px" alignItems="flex-start">
            <Bot size={16} strokeWidth={1.5} color={palette.text.secondary} />
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              {copiedLine()}
            </Typography>
          </Stack>
          {callerBecomesOwner && (
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              This use case's owner has no account in this organization, so you will own the new AI
              app.
            </Typography>
          )}
        </Stack>
      </StandardModal>

      {alert && (
        <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
      )}
    </Stack>
  );
};

export default LinkedAiAppsCard;
