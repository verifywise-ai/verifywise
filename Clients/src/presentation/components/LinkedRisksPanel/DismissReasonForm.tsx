import { useState } from "react";
import { FormControlLabel, Radio, RadioGroup, Stack } from "@mui/material";
import { CustomizableButton } from "../button/customizable-button";
import Field from "../Inputs/Field";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { DismissReason, RiskLink } from "../../../domain/interfaces/i.riskLink";

/**
 * The wording is fixed by the C3 spec (§4) and is also what the "Show
 * dismissed" view renders, so it lives in one exported map rather than inline
 * in the radio list.
 */
export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  not_related: "These aren't actually related",
  too_weak: "Related, but not worth a link",
  duplicate: "Another link already covers this",
  wrong_direction: "The direction is backwards",
  wrong_parent: "Right that it's a child, wrong parent",
  not_hierarchical: "Related, but not parent and child",
  other: "Other",
};

/**
 * Mirrors DISMISS_REASONS_BY_RELATION in
 * Servers/services/riskLinks/dismissReason.ts. The server 400s on a reason
 * offered for the wrong relation type, so these two lists must not drift.
 */
const REASONS_BY_RELATION: Record<RiskLink["relationType"], DismissReason[]> = {
  related_to: ["not_related", "too_weak", "duplicate", "other"],
  inherits_from: ["wrong_direction", "wrong_parent", "not_hierarchical", "other"],
};

const NOTE_MAX_LENGTH = 500;

interface DismissReasonFormProps {
  link: RiskLink;
  pending: boolean;
  /** `dismissal` is undefined when the user chose to say nothing. */
  onSubmit: (dismissal?: { dismissReason: DismissReason; dismissNote?: string }) => void;
  onCancel: () => void;
}

export default function DismissReasonForm({
  link,
  pending,
  onSubmit,
  onCancel,
}: DismissReasonFormProps) {
  // No default selection. That is what makes the reason optional without
  // spending a control on "prefer not to say": pressing Dismiss with nothing
  // chosen IS the skip path, and no reason is ever recorded by accident.
  const [reason, setReason] = useState<DismissReason | "">("");
  const [note, setNote] = useState("");
  const { t } = useTranslation();

  const noteMissing = reason === "other" && note.trim() === "";

  const handleSubmit = () => {
    if (reason === "") return onSubmit();
    const trimmed = note.trim();
    onSubmit({ dismissReason: reason, ...(trimmed ? { dismissNote: trimmed } : {}) });
  };

  return (
    <Stack spacing={4} sx={{ pl: 8, py: 4 }}>
      {/*
        Named after the risk: several of these can be on screen at once in a
        long list, and "Other" alone is not a distinguishable label.
      */}
      <RadioGroup
        aria-label={fill(t("Why are you dismissing {name}?"), {
          name: link.relatedRisk.name ?? fill(t("risk {id}"), { id: link.relatedRisk.id }),
        })}
        value={reason}
        onChange={(event) => setReason(event.target.value as DismissReason)}
      >
        {REASONS_BY_RELATION[link.relationType].map((value) => (
          <FormControlLabel
            key={value}
            value={value}
            control={<Radio size="small" />}
            label={DISMISS_REASON_LABELS[value]}
          />
        ))}
      </RadioGroup>

      {reason === "other" && (
        <Field
          id={`dismiss-note-${link.id}`}
          label="What happened?"
          multiline
          minRows={2}
          value={note}
          // Field owns its inputProps, so the cap lives here rather than on the input.
          onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
        />
      )}

      <Stack direction="row" spacing={4}>
        <CustomizableButton
          size="small"
          variant="contained"
          color="primary"
          isDisabled={pending || noteMissing}
          onClick={handleSubmit}
        >
          Dismiss
        </CustomizableButton>
        <CustomizableButton size="small" variant="text" color="secondary" onClick={onCancel}>
          Cancel
        </CustomizableButton>
      </Stack>
    </Stack>
  );
}
