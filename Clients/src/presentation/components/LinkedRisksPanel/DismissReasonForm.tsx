import { useState } from "react";
import { Button, FormControlLabel, Radio, RadioGroup, Stack, TextField } from "@mui/material";
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

  const noteMissing = reason === "other" && note.trim() === "";

  const handleSubmit = () => {
    if (reason === "") return onSubmit();
    const trimmed = note.trim();
    onSubmit({ dismissReason: reason, ...(trimmed ? { dismissNote: trimmed } : {}) });
  };

  return (
    <Stack spacing={1} sx={{ pl: 2, py: 1 }}>
      {/*
        Named after the risk: several of these can be on screen at once in a
        long list, and "Other" alone is not a distinguishable label.
      */}
      <RadioGroup
        aria-label={`Why are you dismissing ${link.relatedRisk.name ?? `risk ${link.relatedRisk.id}`}?`}
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
        <TextField
          label="What happened?"
          size="small"
          multiline
          minRows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          inputProps={{ maxLength: NOTE_MAX_LENGTH }}
        />
      )}

      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          disabled={pending || noteMissing}
          onClick={handleSubmit}
        >
          Dismiss
        </Button>
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}

