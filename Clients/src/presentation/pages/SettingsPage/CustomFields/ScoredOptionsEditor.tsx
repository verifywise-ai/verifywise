import React from "react";
import { IconButton, Stack, Typography } from "@mui/material";
import { ChevronDown, ChevronUp, Plus as PlusIcon, Trash2 } from "lucide-react";
import Field from "../../../components/Inputs/Field";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import { IScoredOption, roundScore } from "../../../../domain/interfaces/i.customField";

/** One editable option row. `id` is set for options the server already has. */
export interface ScoredOptionRow {
  key: string;
  id?: string;
  label: string;
  score: string;
}

let nextRowKey = 0;
export const newScoredRow = (): ScoredOptionRow => ({
  key: `new-${++nextRowKey}`,
  label: "",
  score: "",
});

export const rowsFromOptions = (options: IScoredOption[]): ScoredOptionRow[] =>
  options.map((o) => ({ key: o.id, id: o.id, label: o.label, score: String(o.score) }));

/** Show what the server will store: rounded to 2 decimals. */
const roundScoreText = (text: string): string => {
  const n = roundScore(Number(text));
  return text.trim() !== "" && Number.isFinite(n) ? String(n) : text;
};

interface ScoredOptionsEditorProps {
  rows: ScoredOptionRow[];
  onChange: (rows: ScoredOptionRow[]) => void;
  /** Records using each option id, from the usage endpoint. */
  usage?: Record<string, number>;
}

const ScoredOptionsEditor: React.FC<ScoredOptionsEditorProps> = ({ rows, onChange, usage }) => {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<ScoredOptionRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };

  return (
    <Stack sx={{ gap: "8px" }}>
      <Typography sx={{ fontSize: "13px", fontWeight: 500, color: "text.secondary" }}>
        Options
      </Typography>
      {rows.map((row, index) => {
        const used = row.id ? (usage?.[row.id] ?? 0) : 0;
        return (
          <Stack key={row.key} direction="row" alignItems="center" sx={{ gap: "8px" }}>
            <Field
              id={`cf-option-label-${index}`}
              value={row.label}
              placeholder="Option label"
              onChange={(e) => update(index, { label: e.target.value })}
              sx={{ flex: 2 }}
            />
            <Field
              id={`cf-option-score-${index}`}
              type="number"
              value={row.score}
              placeholder="Score"
              onChange={(e) => update(index, { score: e.target.value })}
              onBlur={() => update(index, { score: roundScoreText(row.score) })}
              sx={{ flex: 1 }}
            />
            <IconButton
              size="small"
              disableRipple
              aria-label="Move option up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ChevronUp size={16} />
            </IconButton>
            <IconButton
              size="small"
              disableRipple
              aria-label="Move option down"
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            >
              <ChevronDown size={16} />
            </IconButton>
            <IconButton
              size="small"
              disableRipple
              aria-label="Remove option"
              disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </IconButton>
            {used > 0 && (
              <Typography sx={{ fontSize: "12px", color: "text.tertiary", whiteSpace: "nowrap" }}>
                {fill(t("Used by {count}"), { count: used })}
              </Typography>
            )}
          </Stack>
        );
      })}
      <CustomizableButton
        variant="outlined"
        text="Add option"
        icon={<PlusIcon size={14} />}
        onClick={() => onChange([...rows, newScoredRow()])}
        sx={{ alignSelf: "flex-start" }}
      />
    </Stack>
  );
};

export default ScoredOptionsEditor;
