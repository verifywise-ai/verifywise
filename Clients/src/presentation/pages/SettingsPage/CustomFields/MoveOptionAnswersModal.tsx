import React, { useState } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Select from "../../../components/Inputs/Select";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import {
  CustomFieldEntityType,
  entityCountNoun,
  formatScoredOption,
  IScoredOptionInput,
} from "../../../../domain/interfaces/i.customField";

export interface OptionInUse {
  id: string;
  label: string;
  count: number;
}

interface MoveOptionAnswersModalProps {
  inUse: OptionInUse[];
  entityType: CustomFieldEntityType;
  /**
   * Options that remain after the save. Scored options need an id to be a
   * target; a plain select or multiselect option is its own text.
   */
  remaining: ReadonlyArray<IScoredOptionInput | string>;
  /** The field is required: records whose answers are removed will need a new one. */
  required: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  /** moves: removed option -> target option; removals: options whose answers are deleted. */
  onConfirm: (moves: Record<string, string>, removals: string[]) => void;
}

// Select value for "Remove from records". Option text can never contain NUL
// (PostgreSQL rejects it in text), so it cannot collide with a real option.
const REMOVE = "\u0000remove";

const MoveOptionAnswersModal: React.FC<MoveOptionAnswersModalProps> = ({
  inUse,
  entityType,
  remaining,
  required,
  isSubmitting,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [moves, setMoves] = useState<Record<string, string>>({});
  // Plain option text is free text: read only keys this object owns, so an
  // option named "constructor" is not mistaken for a choice.
  const chosen = (id: string): string =>
    Object.prototype.hasOwnProperty.call(moves, id) ? moves[id] : "";
  const [error, setError] = useState<string | null>(null);
  const targets = remaining.flatMap((o) => {
    if (typeof o === "string") return [{ _id: o, name: o }];
    return typeof o.id === "string" ? [{ _id: o.id, name: formatScoredOption(o) }] : [];
  });
  const choices = [...targets, { _id: REMOVE, name: t("Remove from records") }];

  return (
    <StandardModal
      isOpen={true}
      title="Choose what happens to answers"
      description="Records use the options you removed. Move their answers to another option, or remove them."
      submitButtonText="Save"
      isSubmitting={isSubmitting}
      onClose={onCancel}
      onSubmit={() => {
        if (inUse.some((o) => !chosen(o.id))) {
          setError(t("Choose an option for each removed option."));
          return;
        }
        const chosenMoves: Record<string, string> = {};
        const removals: string[] = [];
        for (const o of inUse) {
          const choice = chosen(o.id);
          if (choice === REMOVE) removals.push(o.id);
          else chosenMoves[o.id] = choice;
        }
        onConfirm(chosenMoves, removals);
      }}
    >
      <Stack sx={{ gap: "16px" }}>
        {targets.length === 0 && (
          <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>
            {t(
              "New options can't receive answers until they are saved. Remove these answers now, or save the new options first and move the answers later.",
            )}
          </Typography>
        )}
        {inUse.map((option, index) => (
          <Stack key={option.id} sx={{ gap: "8px" }}>
            <Typography sx={{ fontSize: "13px" }}>
              {fill(
                t("{option} is used by {count} {records}. Choose what happens to these answers:"),
                {
                  count: option.count,
                  records: t(entityCountNoun(entityType, option.count)),
                  option: option.label,
                },
              )}
            </Typography>
            <Select
              id={`move-${index}`}
              value={chosen(option.id)}
              items={choices}
              placeholder="Select an option"
              onChange={(e) => setMoves((m) => ({ ...m, [option.id]: e.target.value as string }))}
            />
            {chosen(option.id) === REMOVE && (
              <Typography sx={{ fontSize: "12px", color: "error.main" }}>
                {t("These answers will be deleted and can't be restored.")}
                {required &&
                  ` ${t("This field is required, so these records will need a new answer.")}`}
              </Typography>
            )}
          </Stack>
        ))}
        {error && <Typography sx={{ fontSize: "12px", color: "error.main" }}>{error}</Typography>}
      </Stack>
    </StandardModal>
  );
};

export default MoveOptionAnswersModal;
