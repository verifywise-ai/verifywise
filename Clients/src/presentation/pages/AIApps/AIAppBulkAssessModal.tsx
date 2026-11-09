import { useState } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../../components/Modals/StandardModal";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import Alert from "../../components/Alert";
import { palette } from "../../themes/palette";
import { fill } from "../../../i18n/fill";
import { useTranslation } from "../../../application/hooks/useTranslation";
import {
  useAiAppQuestionnaires,
  useBulkAssessAiApps,
} from "../../../application/hooks/useAiAppBulk";
import { errorMessage } from "../../../application/repository/aiAppBulk.repository";
import type { IAiAppBulkAssessResult } from "../../../domain/interfaces/i.aiAppBulk";
import { CountSummary } from "./AIAppAssessments/AssessmentDisplay";
import { MAX_BULK_ROWS } from "./bulkUtils";
import { controlSelectSx } from "./style";

interface AIAppBulkAssessModalProps {
  appIds: number[];
  onClose: () => void;
  /** Requested assessments exist now, so the selection has done its job. */
  onAssessed: () => void;
  onGoToAssessments: (questionnaireId: number) => void;
}

export default function AIAppBulkAssessModal({
  appIds,
  onClose,
  onAssessed,
  onGoToAssessments,
}: AIAppBulkAssessModalProps) {
  const { t } = useTranslation();
  const { data: questionnaires = [], isLoading } = useAiAppQuestionnaires();
  const [choice, setChoice] = useState<number | null>(null);
  const [notifyOwners, setNotifyOwners] = useState(true);
  const [result, setResult] = useState<IAiAppBulkAssessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assessMutation = useBulkAssessAiApps();

  const questionnaireId = choice ?? questionnaires.find((q) => q.is_default)?.id ?? null;
  const overLimit = appIds.length > MAX_BULK_ROWS;

  const handleSubmit = async () => {
    if (result && questionnaireId) {
      onGoToAssessments(questionnaireId);
      return;
    }
    if (!questionnaireId || overLimit) return;
    setError(null);
    try {
      const response = await assessMutation.mutateAsync({
        app_ids: appIds,
        questionnaire_id: questionnaireId,
        notify_owners: notifyOwners,
      });
      setResult(response);
      onAssessed();
    } catch (err) {
      setError(errorMessage(err, t("Could not request the assessments. Try again.")));
    }
  };

  return (
    <StandardModal
      isOpen
      onClose={onClose}
      title="Assess AI apps"
      description={
        appIds.length === 1
          ? t("Request an assessment for 1 AI app.")
          : fill(t("Request an assessment for {count} AI apps."), { count: appIds.length })
      }
      onSubmit={handleSubmit}
      submitButtonText={result ? "Go to assessments" : "Request assessments"}
      isSubmitting={assessMutation.isPending}
      isSubmitDisabled={!questionnaireId || overLimit || isLoading}
      cancelButtonText={result ? "Close" : "Cancel"}
      fitContent
    >
      <Stack gap="16px">
        {result ? (
          <>
            <CountSummary
              items={[
                { label: t("Created"), value: result.created },
                { label: t("Already open"), value: result.already_open },
                { label: t("Not found"), value: result.not_found },
                { label: t("No owner"), value: result.unassigned },
                { label: t("Owners notified"), value: result.owners_notified },
              ]}
            />
            {result.unassigned > 0 && (
              <Alert
                variant="info"
                body={
                  result.unassigned === 1
                    ? t("1 app has no owner, so an editor needs to answer it.")
                    : fill(t("{count} apps have no owner, so an editor needs to answer them."), {
                        count: result.unassigned,
                      })
                }
                inline
              />
            )}
          </>
        ) : (
          <>
            <Select
              id="ai-apps-bulk-assess-questionnaire"
              label="Questionnaire"
              placeholder="Select a questionnaire"
              value={questionnaireId ?? ""}
              onChange={(e) => setChoice(Number(e.target.value))}
              items={questionnaires.map((q) => ({ _id: q.id, name: q.name }))}
              disabled={isLoading}
              dataTestId="ai-apps-bulk-assess-questionnaire"
              sx={controlSelectSx}
            />
            <Stack gap="4px">
              <Checkbox
                id="ai-apps-bulk-assess-notify"
                label="Notify app owners"
                value="notify-owners"
                isChecked={notifyOwners}
                onChange={(e) => setNotifyOwners(e.target.checked)}
              />
              <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                Each owner gets one summary, in the app and by email, however many apps are theirs.
                Apps with no owner stay with editors.
              </Typography>
            </Stack>
            {overLimit && (
              <Alert
                variant="warning"
                body={fill(t("Select {max} AI apps or fewer."), { max: MAX_BULK_ROWS })}
                inline
              />
            )}
            {error && <Alert variant="error" body={error} inline />}
          </>
        )}
      </Stack>
    </StandardModal>
  );
}
