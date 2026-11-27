import { useState } from "react";
import CustomException from "../../../../infrastructure/exceptions/customException";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { ChevronDown } from "lucide-react";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import Radio from "../../Inputs/Radio";
import { status, text, radiusPx } from "../../../themes/palette";
import { fontSize } from "../../../themes/typography";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { useCan } from "../../../../application/hooks/useCan";
import { useRisksLinkedOnlyToProject } from "../../../../application/hooks/useRisksLinkedOnlyToProject";
import { useDeleteUseCase } from "../../../../application/hooks/useDeleteUseCase";
import type { DeleteUseCaseResult } from "../../../../application/repository/project.repository";
import { fill, pluralKey } from "../../../../i18n/fill";

type RiskChoice = "archive" | "keep";

interface DeleteUseCaseModalProps {
  projectId: number;
  /** Defaults to "Delete this use case?". */
  title?: string;
  /** The dialog's usual text, shown in every state. */
  message: string;
  proceedText: string;
  /**
   * Runs once the use case is deleted, with what the server archived. The
   * dialog stays open (and cannot be closed) until it returns; the caller
   * closes it there. Never called when the delete failed.
   */
  onDeleted: (result: DeleteUseCaseResult) => Promise<void> | void;
  onCancel: () => void;
}

/**
 * The use case delete confirmation. A risk linked only to this use case is
 * linked to none once it is deleted, and an active risk linked to no use case
 * is visible to everyone in the organization (an archived one is not). When
 * there are such risks the dialog says so and offers to archive them (the
 * default). The delete is one request (DELETE /api/v1/projects/:id) carrying
 * that choice: the server works out the risks again at that moment and
 * archives them in the delete's transaction, so a failure changes nothing and
 * the dialog stays open with an error. While it runs the dialog cannot be
 * closed. When there are no such risks it is the plain confirmation.
 *
 * The archive flag does not depend on the count read when the dialog opened:
 * with risks.edit and "archive" chosen (the default, and the only state when
 * the count was 0) it is always sent, and the server archives whatever set it
 * finds at that moment, which may be empty. When the count could not be read,
 * the choice is still offered next to a neutral warning.
 */
function DeleteUseCaseModal({
  projectId,
  title = "Delete this use case?",
  message,
  proceedText,
  onDeleted,
  onCancel,
}: DeleteUseCaseModalProps) {
  const { t, lang } = useTranslation();
  const canArchive = useCan("risks.edit");
  const { data, isLoading, isError, refetch } = useRisksLinkedOnlyToProject(projectId);
  const [choice, setChoice] = useState<RiskChoice>("archive");
  const [showNames, setShowNames] = useState(false);
  const deleteUseCase = useDeleteUseCase();
  // Covers the delete and the caller's follow-up, so neither runs twice and
  // the dialog cannot close in between.
  const [isWorking, setIsWorking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const count = data?.count ?? 0;
  const willArchive = canArchive && choice === "archive";
  // An unknown count (the request failed) reads as plural ("these risks").
  const pluralCount = data ? count : 2;
  const plural = (one: string, other: string) => t(pluralKey(lang, pluralCount, one, other));

  const handleProceed = async () => {
    if (isWorking) return;
    setDeleteError(null);
    setIsWorking(true);
    let result: DeleteUseCaseResult;
    try {
      result = await deleteUseCase.mutateAsync({
        id: projectId,
        archiveRisksLinkedOnlyHere: willArchive,
      });
    } catch (error) {
      // The server rolled back the archive and the delete together. A refusal
      // (400, e.g. the project holds EU AI Act (organization)) says why.
      setDeleteError(
        error instanceof CustomException && error.status === 400
          ? error.message
          : t("The use case could not be deleted. Nothing was changed. Try again."),
      );
      // The linked risks may have changed since the dialog opened.
      void refetch();
      setIsWorking(false);
      return;
    }
    try {
      await onDeleted(result);
    } finally {
      setIsWorking(false);
    }
  };

  const handleCancel = () => {
    if (!isWorking) onCancel();
  };

  const bodyText = { fontSize: fontSize.base, color: text.primary };

  // Offered when there are risks to archive, and when the count is unknown.
  const riskChoice = (
    <Stack role="radiogroup" sx={{ gap: "8px" }}>
      <Radio
        id="delete-use-case-archive-risks"
        name="delete-use-case-risks"
        value="archive"
        size="small"
        checked={choice === "archive"}
        onChange={() => setChoice("archive")}
        title={plural("Archive this risk", "Archive these risks")}
        testId="radio-delete-use-case-archive-risks"
        disabled={isWorking}
      />
      <Radio
        id="delete-use-case-keep-risks"
        name="delete-use-case-risks"
        value="keep"
        size="small"
        checked={choice === "keep"}
        onChange={() => setChoice("keep")}
        title={plural("Keep it visible to everyone", "Keep them visible to everyone")}
        testId="radio-delete-use-case-keep-risks"
        disabled={isWorking}
      />
    </Stack>
  );

  const body = (
    <Stack sx={{ gap: "12px" }} data-testid="delete-use-case-modal">
      <Typography sx={bodyText}>{message}</Typography>

      {isLoading && (
        <Typography sx={{ ...bodyText, color: text.muted }}>Checking linked risks...</Typography>
      )}

      {isError && (
        <Typography sx={bodyText} data-testid="delete-use-case-risks-unknown">
          Risks linked only to this use case may become visible to everyone in the organization.
        </Typography>
      )}

      {isError && canArchive && riskChoice}

      {count > 0 && data && (
        <Stack sx={{ gap: "12px" }}>
          <Box
            data-testid="delete-use-case-risks-warning"
            sx={{
              p: "12px",
              borderRadius: radiusPx.sm,
              border: `1px solid ${status.warning.border}`,
              backgroundColor: status.warning.bg,
            }}
          >
            <Typography sx={{ ...bodyText, color: status.warning.text }}>
              {fill(
                plural(
                  "{count} risk is linked only to this use case. After you delete it, everyone in the organization can see it.",
                  "{count} risks are linked only to this use case. After you delete it, everyone in the organization can see them.",
                ),
                { count },
              )}
            </Typography>
          </Box>

          {canArchive ? (
            riskChoice
          ) : (
            <Typography sx={bodyText}>Your role does not allow archiving risks.</Typography>
          )}

          <Typography sx={{ ...bodyText, color: text.muted }}>
            {plural(
              "To keep it private, cancel and link it to another use case first.",
              "To keep them private, cancel and link them to another use case first.",
            )}
          </Typography>

          <Box>
            <Box
              component="button"
              type="button"
              aria-expanded={showNames}
              data-testid="button-delete-use-case-risk-names"
              onClick={() => setShowNames((open) => !open)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                p: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: fontSize.base,
                color: text.primary,
              }}
            >
              <ChevronDown
                size={14}
                strokeWidth={1.5}
                style={{ transform: showNames ? "rotate(180deg)" : "none" }}
              />
              <span>{showNames ? t("Hide risk names") : t("Show risk names")}</span>
            </Box>
            <Collapse in={showNames}>
              <Box
                component="ul"
                sx={{
                  m: "8px 0 0",
                  pl: "18px",
                  maxHeight: "160px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {data.risks.map((risk) => (
                  <Box component="li" key={risk.id} sx={bodyText}>
                    {risk.risk_name}
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Box>
        </Stack>
      )}

      {deleteError && (
        <Typography
          role="alert"
          sx={{ ...bodyText, color: status.error.text }}
          data-testid="delete-use-case-error"
        >
          {deleteError}
        </Typography>
      )}
    </Stack>
  );

  return (
    <ConfirmationModal
      title={title}
      body={body}
      cancelText="Cancel"
      proceedText={proceedText}
      onCancel={handleCancel}
      onProceed={handleProceed}
      proceedButtonColor="error"
      proceedButtonVariant="contained"
      TitleFontSize={0}
      isLoading={isWorking}
      isProceedDisabled={isLoading}
    />
  );
}

export default DeleteUseCaseModal;
