import { useRef, useState } from "react";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowDown, ArrowUp, Plus, SquarePen, Trash2 } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import Alert from "../../../components/Alert";
import Chip from "../../../components/Chip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { palette } from "../../../themes/palette";
import { fill } from "../../../../i18n/fill";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { useCanAdminAiApps } from "../../../../application/hooks/useCanEditAiApps";
import {
  useAiAppQuestionnaires,
  useDeleteAiAppQuestionnaire,
  useSaveAiAppQuestionnaire,
} from "../../../../application/hooks/useAiAppBulk";
import { errorMessage } from "../../../../application/repository/aiAppBulk.repository";
import type { IAiAppQuestionnaire } from "../../../../domain/interfaces/i.aiAppBulk";
import { controlButtonSx, controlFieldSx, controlSelectSx } from "../style";

interface DraftQuestion {
  /** Stable while reordering; the server assigns the real key on save. */
  draftId: number;
  label: string;
  description: string;
  weight: number;
}

interface Draft {
  id?: number;
  name: string;
  description: string;
  questions: DraftQuestion[];
}

const WEIGHT_OPTIONS = [1, 2, 3, 4, 5].map((weight) => ({ _id: weight, name: String(weight) }));

function validateDraft(draft: Draft): string | null {
  if (!draft.name.trim()) return "Enter a name.";
  if (draft.questions.length === 0) return "Add at least one question.";
  if (draft.questions.some((q) => !q.label.trim())) return "Enter a label for every question.";
  const labels = draft.questions.map((q) => q.label.trim().toLowerCase());
  if (new Set(labels).size !== labels.length) {
    return "Each question needs a different label, because worksheet columns are matched by label.";
  }
  return null;
}

export default function QuestionnaireManagerModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const canAdmin = useCanAdminAiApps();
  const nextDraftId = useRef(1);
  const { data: questionnaires = [] } = useAiAppQuestionnaires();
  const saveMutation = useSaveAiAppQuestionnaire();
  const deleteMutation = useDeleteAiAppQuestionnaire();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IAiAppQuestionnaire | null>(null);
  const [error, setError] = useState<string | null>(null);

  const newQuestion = (): DraftQuestion => ({
    draftId: nextDraftId.current++,
    label: "",
    description: "",
    weight: 1,
  });

  const startCreate = () => {
    setError(null);
    setDraft({ name: "", description: "", questions: [newQuestion()] });
  };

  const startEdit = (questionnaire: IAiAppQuestionnaire) => {
    setError(null);
    setDraft({
      id: questionnaire.id,
      name: questionnaire.name,
      description: questionnaire.description ?? "",
      questions: questionnaire.questions.map((question) => ({
        draftId: nextDraftId.current++,
        label: question.label,
        description: question.description ?? "",
        weight: question.weight,
      })),
    });
  };

  const backToList = () => {
    setError(null);
    setDraft(null);
  };

  const updateQuestion = (draftId: number, patch: Partial<DraftQuestion>) =>
    setDraft(
      (prev) =>
        prev && {
          ...prev,
          questions: prev.questions.map((q) => (q.draftId === draftId ? { ...q, ...patch } : q)),
        },
    );

  const moveQuestion = (index: number, offset: number) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const questions = [...prev.questions];
      const [moved] = questions.splice(index, 1);
      questions.splice(index + offset, 0, moved);
      return { ...prev, questions };
    });

  const removeQuestion = (draftId: number) =>
    setDraft(
      (prev) => prev && { ...prev, questions: prev.questions.filter((q) => q.draftId !== draftId) },
    );

  const addQuestion = () =>
    setDraft((prev) => prev && { ...prev, questions: [...prev.questions, newQuestion()] });

  const handleSave = async () => {
    if (!draft) return;
    const problem = validateDraft(draft);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError(null);
    try {
      await saveMutation.mutateAsync({
        id: draft.id,
        payload: {
          name: draft.name.trim(),
          description: draft.description.trim(),
          questions: draft.questions.map((q) => ({
            label: q.label.trim(),
            description: q.description.trim(),
            weight: q.weight,
          })),
        },
      });
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err, t("Could not save the questionnaire. Try again.")));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
    } catch (err) {
      setError(errorMessage(err, t("Could not delete the questionnaire. Try again.")));
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <>
      <StandardModal
        isOpen
        onClose={draft ? backToList : onClose}
        title={draft ? (draft.id ? "Edit questionnaire" : "New questionnaire") : "Questionnaires"}
        description={
          draft
            ? "Each question is rated 1 to 5. A higher weight counts more towards the score."
            : "Questions used to assess AI apps."
        }
        maxWidth="800px"
        onSubmit={handleSave}
        submitButtonText="Save questionnaire"
        isSubmitting={saveMutation.isPending}
        hideSubmitButton={!draft}
        cancelButtonText={draft ? "Back" : "Close"}
      >
        <Stack gap="16px">
          {error && <Alert variant="error" body={error} inline />}

          {draft ? (
            <>
              <Field
                id="ai-app-questionnaire-name"
                label="Name"
                isRequired
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                dataTestId="ai-app-questionnaire-name"
                sx={controlFieldSx}
              />
              <Field
                id="ai-app-questionnaire-description"
                label="Description"
                isOptional
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                dataTestId="ai-app-questionnaire-description"
                sx={controlFieldSx}
              />

              {draft.questions.map((question, index) => (
                <Box
                  key={question.draftId}
                  sx={{
                    p: "12px",
                    border: `1px solid ${palette.border.dark}`,
                    borderRadius: "4px",
                  }}
                >
                  <Stack gap="8px">
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                        {fill(t("Question {number}"), { number: index + 1 })}
                      </Typography>
                      <Stack direction="row" gap="4px">
                        <IconButton
                          size="small"
                          disabled={index === 0}
                          onClick={() => moveQuestion(index, -1)}
                          aria-label={fill(t("Move question {number} up"), { number: index + 1 })}
                          data-testid={`ai-app-question-up-${index}`}
                        >
                          <ArrowUp size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          size="small"
                          disabled={index === draft.questions.length - 1}
                          onClick={() => moveQuestion(index, 1)}
                          aria-label={fill(t("Move question {number} down"), {
                            number: index + 1,
                          })}
                          data-testid={`ai-app-question-down-${index}`}
                        >
                          <ArrowDown size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => removeQuestion(question.draftId)}
                          aria-label={fill(t("Remove question {number}"), { number: index + 1 })}
                          data-testid={`ai-app-question-remove-${index}`}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Stack>
                    </Stack>
                    <Stack direction="row" gap="8px" alignItems="flex-start">
                      <Box sx={{ flex: 1 }}>
                        <Field
                          id={`ai-app-question-label-${question.draftId}`}
                          label="Label"
                          isRequired
                          value={question.label}
                          onChange={(e) =>
                            updateQuestion(question.draftId, { label: e.target.value })
                          }
                          dataTestId={`ai-app-question-label-${index}`}
                          sx={controlFieldSx}
                        />
                      </Box>
                      <Select
                        id={`ai-app-question-weight-${question.draftId}`}
                        label="Weight"
                        value={question.weight}
                        onChange={(e) =>
                          updateQuestion(question.draftId, { weight: Number(e.target.value) })
                        }
                        items={WEIGHT_OPTIONS}
                        dataTestId={`ai-app-question-weight-${index}`}
                        sx={{ ...controlSelectSx, width: 100 }}
                      />
                    </Stack>
                    <Field
                      id={`ai-app-question-description-${question.draftId}`}
                      label="Description"
                      isOptional
                      value={question.description}
                      onChange={(e) =>
                        updateQuestion(question.draftId, { description: e.target.value })
                      }
                      dataTestId={`ai-app-question-description-${index}`}
                      sx={controlFieldSx}
                    />
                  </Stack>
                </Box>
              ))}

              <Box>
                <CustomizableButton
                  text="Add question"
                  variant="outlined"
                  startIcon={<Plus size={16} strokeWidth={1.5} />}
                  onClick={addQuestion}
                  testId="ai-app-question-add"
                  sx={controlButtonSx}
                />
              </Box>
            </>
          ) : (
            <>
              <Box>
                <CustomizableButton
                  text="New questionnaire"
                  variant="contained"
                  startIcon={<Plus size={16} strokeWidth={1.5} />}
                  onClick={startCreate}
                  testId="ai-app-questionnaire-new"
                  sx={controlButtonSx}
                />
              </Box>
              <Stack sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px" }}>
                {questionnaires.map((questionnaire, index) => (
                  <Stack
                    key={questionnaire.id}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    gap="12px"
                    sx={{
                      p: "8px 12px",
                      borderTop: index === 0 ? "none" : `1px solid ${palette.border.dark}`,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" gap="8px">
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                          {questionnaire.name}
                        </Typography>
                        {questionnaire.is_default && (
                          <Chip label="Default" variant="info" size="small" uppercase={false} />
                        )}
                      </Stack>
                      <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
                        {questionnaire.questions.length === 1
                          ? t("1 question")
                          : fill(t("{count} questions"), {
                              count: questionnaire.questions.length,
                            })}
                      </Typography>
                    </Box>
                    <Stack direction="row" gap="4px">
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => startEdit(questionnaire)}
                          aria-label={fill(t("Edit {name}"), { name: questionnaire.name })}
                          data-testid={`ai-app-questionnaire-edit-${questionnaire.id}`}
                        >
                          <SquarePen size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Tooltip>
                      {canAdmin && (
                        <Tooltip
                          title={
                            questionnaire.is_default
                              ? t("The default questionnaire can't be deleted")
                              : t("Delete")
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              disabled={questionnaire.is_default}
                              onClick={() => {
                                setError(null);
                                setPendingDelete(questionnaire);
                              }}
                              aria-label={fill(t("Delete {name}"), { name: questionnaire.name })}
                              data-testid={`ai-app-questionnaire-delete-${questionnaire.id}`}
                            >
                              <Trash2 size={14} strokeWidth={1.5} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </StandardModal>

      {pendingDelete && (
        <ConfirmationModal
          isOpen
          title="Delete questionnaire"
          body={
            <Typography fontSize={13}>
              {fill(t("Delete {name}? This can't be undone."), { name: pendingDelete.name })}
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete questionnaire"
          onCancel={() => setPendingDelete(null)}
          onProceed={handleDelete}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          isLoading={deleteMutation.isPending}
        />
      )}
    </>
  );
}
