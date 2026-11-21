import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import { dismissReasonLabel } from "../../../../application/utils/vendorResearchText";
import type {
  DismissReason,
  VendorRiskFinding,
} from "../../../../domain/interfaces/i.vendorResearch";

/** The reasons the server accepts, in the order the select lists them. */
const DISMISS_REASONS: DismissReason[] = [
  "not_applicable",
  "already_covered",
  "inaccurate",
  "accepted_risk",
  "wrong_vendor",
  "outdated",
  "other",
];

/**
 * The server accepts a note of up to this many characters; the helper text below names the number.
 * It counts code points, as the server does and as `Array.from` does, not the UTF-16 units that
 * `length` and `slice` count. So a UTF-16 pair is never cut in half, but an emoji made of several
 * code points (a flag, a skin tone, a ZWJ family) counts as several.
 */
const NOTE_MAX_LENGTH = 500;

export interface DismissalBody {
  reason: DismissReason;
  note?: string;
}

interface DismissFindingModalProps {
  finding: Pick<VendorRiskFinding, "risk_description">;
  isSubmitting: boolean;
  onClose: () => void;
  /** Called with the reason, and the note when it is not empty once trimmed. */
  onSubmit: (body: DismissalBody) => void;
}

/**
 * Asks why a finding does not belong in the register. The parent mounts it only while it is
 * open, so each opening starts with nothing chosen; closing it is the parent's call, so that a
 * failed dismissal leaves it open with what was entered.
 */
export default function DismissFindingModal({
  finding,
  isSubmitting,
  onClose,
  onSubmit,
}: DismissFindingModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<DismissReason | "">("");
  const [note, setNote] = useState("");

  const handleSubmit = () => {
    if (reason === "") return;
    const trimmed = note.trim();
    onSubmit(trimmed === "" ? { reason } : { reason, note: trimmed });
  };

  return (
    <StandardModal
      isOpen
      onClose={onClose}
      title="Dismiss finding"
      description="Choose why this finding does not belong in the register. Similar findings are not suggested again."
      onSubmit={handleSubmit}
      submitButtonText="Dismiss"
      isSubmitting={isSubmitting}
      isSubmitDisabled={reason === ""}
      maxWidth="560px"
    >
      <Stack sx={{ gap: "16px" }}>
        {/* Which finding this is about. It is the model's text, not ours. */}
        <Box
          data-vw-no-translate="true"
          sx={{
            p: "12px",
            border: "1px solid",
            borderColor: "border.dark",
            borderRadius: "4px",
            backgroundColor: "background.accent",
          }}
        >
          <Typography
            sx={{ ...textStyles.body, color: "text.secondary", overflowWrap: "anywhere" }}
          >
            {finding.risk_description}
          </Typography>
        </Box>
        <Select
          id="dismiss-finding-reason"
          label="Reason"
          isRequired
          placeholder="Select a reason"
          value={reason}
          items={DISMISS_REASONS.map((value) => ({
            _id: value,
            name: dismissReasonLabel(value, t),
          }))}
          onChange={(event) => setReason(event.target.value as DismissReason)}
        />
        <Field
          id="dismiss-finding-note"
          label="Note"
          isOptional
          multiline
          minRows={3}
          value={note}
          onChange={(event) =>
            setNote(Array.from(event.target.value).slice(0, NOTE_MAX_LENGTH).join(""))
          }
          helperText="Up to 500 characters."
        />
      </Stack>
    </StandardModal>
  );
}
