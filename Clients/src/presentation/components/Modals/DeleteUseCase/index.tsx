import { useState } from "react";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { ChevronDown } from "lucide-react";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import Radio from "../../Inputs/Radio";
import { status, text, radiusPx } from "../../../themes/palette";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { useCan } from "../../../../application/hooks/useCan";
import { useRisksLinkedOnlyToProject } from "../../../../application/hooks/useRisksLinkedOnlyToProject";
import { useBulkUpdateProjectRisks } from "../../../../application/hooks/useBulkUpdateProjectRisks";
import { fill, pluralKey } from "../../../../i18n/fill";

/** The bulk route takes at most this many ids per request. */
const ARCHIVE_BATCH_SIZE = 200;

type RiskChoice = "archive" | "keep";

interface DeleteUseCaseModalProps {
  projectId: number;
  /** The dialog's usual text, shown in every state. */
  message: string;
  proceedText: string;
  /** Deletes the use case. Runs after the archive, and never if it failed. */
  onDelete: () => Promise<void> | void;
  onCancel: () => void;
}

/**
 * The use case delete confirmation. A risk linked only to this use case is
 * linked to none once it is deleted, and a risk linked to no use case is
 * visible to everyone in the organization. When there are such risks the
 * dialog says so and offers to archive them first (the default) through the
 * bulk archive route. When there are none it is the plain confirmation.
 */
function DeleteUseCaseModal({
  projectId,
  message,
  proceedText,
  onDelete,
  onCancel,
}: DeleteUseCaseModalProps) {
  const { t, lang } = useTranslation();
  const canArchive = useCan("risks.edit");
  const { data, isLoading, isError, refetch } = useRisksLinkedOnlyToProject(projectId);
  const [choice, setChoice] = useState<RiskChoice>("archive");
  const [showNames, setShowNames] = useState(false);
  const bulkUpdate = useBulkUpdateProjectRisks();
  // Covers the archive and the delete, so neither can be sent twice.
  const [isWorking, setIsWorking] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const count = data?.count ?? 0;
  const willArchive = count > 0 && canArchive && choice === "archive";
  const plural = (one: string, other: string) => t(pluralKey(lang, count, one, other));

  const handleProceed = async () => {
    setArchiveError(null);
    setIsWorking(true);
    try {
      if (willArchive && data) {
        try {
          const ids = data.risks.map((risk) => risk.id);
          for (let i = 0; i < ids.length; i += ARCHIVE_BATCH_SIZE) {
            await bulkUpdate.mutateAsync({
              ids: ids.slice(i, i + ARCHIVE_BATCH_SIZE),
              action: "archive",
            });
          }
        } catch {
          setArchiveError(
            t("The risks could not be archived, so the use case was not deleted. Try again."),
          );
          // A batch may have gone through: read the list again so a retry
          // sends only the risks that are still active.
          void refetch();
          return;
        }
      }
      await onDelete();
    } finally {
      setIsWorking(false);
    }
  };

  const bodyText = { fontSize: "13px", color: text.primary };

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
                fontSize: "13px",
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

      {archiveError && (
        <Typography
          role="alert"
          sx={{ ...bodyText, color: status.error.text }}
          data-testid="delete-use-case-archive-error"
        >
          {archiveError}
        </Typography>
      )}
    </Stack>
  );

  return (
    <ConfirmationModal
      title="Delete this use case?"
      body={body}
      cancelText="Cancel"
      proceedText={proceedText}
      onCancel={onCancel}
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
