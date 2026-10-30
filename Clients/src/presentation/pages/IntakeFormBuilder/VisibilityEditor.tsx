import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { Plus, Trash2 } from "lucide-react";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import { CustomizableButton } from "../../components/button/customizable-button";
import type { FormField } from "./types";
import {
  MAX_CONDITIONS,
  OPERATORS_BY_TYPE,
  type Condition,
  type ConditionOperator,
  type Visibility,
} from "../../../application/utils/intakeFormLogic";

const SYMBOLS: Partial<Record<ConditionOperator, string>> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

/** How an operator reads for a referenced field of type `refType`. */
export function operatorLabel(refType: string, operator: ConditionOperator): string {
  if (SYMBOLS[operator]) return SYMBOLS[operator]!;
  if (operator === "is_empty") return "is empty";
  if (operator === "is_not_empty") return "is not empty";
  if (operator === "is_checked") return "is checked";
  if (operator === "is_not_checked") return "is not checked";
  if (operator === "contains") return "contains";
  if (refType === "multiselect") {
    if (operator === "equals") return "includes";
    if (operator === "not_equals") return "does not include";
    return "includes any of";
  }
  if (operator === "equals") return "is";
  if (operator === "not_equals") return "is not";
  return "is one of";
}

/** The collapsed section's one-line summary. */
export function visibilitySummary(visibility?: Visibility): string {
  if (!visibility || !Array.isArray(visibility.conditions) || visibility.conditions.length === 0) {
    return "Always shown";
  }
  return visibility.match === "any"
    ? "Shown when any condition matches"
    : "Shown when all conditions match";
}

const NO_VALUE: ConditionOperator[] = ["is_empty", "is_not_empty", "is_checked", "is_not_checked"];

function defaultCondition(ref: FormField): Condition {
  const operator = (OPERATORS_BY_TYPE[ref.type] ?? ["is_not_empty"])[0];
  const firstOption = ref.options?.[0]?.value;
  if (NO_VALUE.includes(operator)) return { fieldId: ref.id, operator };
  if (operator === "one_of") return { fieldId: ref.id, operator, value: [] };
  if (firstOption !== undefined) return { fieldId: ref.id, operator, value: firstOption };
  return { fieldId: ref.id, operator };
}

/**
 * The condition with a new operator, keeping the value the author chose
 * when it still fits ("is EU" → "is not EU", "is EU" → "is one of [EU]").
 */
export function withOperator(
  condition: Condition,
  ref: FormField,
  operator: ConditionOperator,
): Condition {
  const { value } = condition;
  if (NO_VALUE.includes(operator)) return { fieldId: condition.fieldId, operator };
  if (operator === "one_of") {
    const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    return { fieldId: condition.fieldId, operator, value: list };
  }
  if (SYMBOLS[operator]) {
    return typeof value === "number"
      ? { fieldId: condition.fieldId, operator, value }
      : { fieldId: condition.fieldId, operator };
  }
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single === "string") return { fieldId: condition.fieldId, operator, value: single };
  return { ...defaultCondition(ref), operator };
}

interface VisibilityEditorProps {
  visibility?: Visibility;
  /** Every other field in the form; rules may use any of them. */
  otherFields: FormField[];
  onChange: (visibility: Visibility | undefined) => void;
  /**
   * Why no rule can be added (e.g. the field is mapped to a required entity
   * field). Existing conditions stay listed so they can be removed.
   */
  blockedReason?: string;
}

export function VisibilityEditor({
  visibility,
  otherFields: allOtherFields,
  onChange,
  blockedReason,
}: VisibilityEditorProps) {
  const theme = useTheme();
  const conditions = Array.isArray(visibility?.conditions) ? visibility.conditions : [];
  const match = visibility?.match ?? "all";
  const otherFields = blockedReason ? [] : allOtherFields;
  const hint =
    blockedReason ?? (otherFields.length === 0 ? "Add another field to create a rule" : null);

  const commit = (next: Condition[], nextMatch = match) =>
    onChange(next.length === 0 ? undefined : { match: nextMatch, conditions: next });
  const update = (index: number, condition: Condition) =>
    commit(conditions.map((c, i) => (i === index ? condition : c)));

  // With nothing to choose from, leftover conditions are still listed so the
  // author can remove them (they block saving a live form).
  if (hint && conditions.length === 0) {
    return (
      <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>{hint}</Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {conditions.length > 1 && (
        <Select
          id="visibility-match"
          label="Match"
          value={match}
          items={[
            { _id: "all", name: "All conditions" },
            { _id: "any", name: "Any condition" },
          ]}
          onChange={(e) => commit(conditions, e.target.value === "any" ? "any" : "all")}
        />
      )}
      {conditions.map((condition, index) => {
        // A removed field, or one that would make a loop, is not offered:
        // the row says so instead of showing a different field's condition.
        const ref = otherFields.find((f) => f.id === condition.fieldId);
        const operators = (ref && OPERATORS_BY_TYPE[ref.type]) ?? ["is_empty", "is_not_empty"];
        const operator = condition.operator as ConditionOperator;
        return (
          <Box
            key={index}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              p: "8px",
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Select
                  id={`condition-field-${index}`}
                  label="Field"
                  value={ref?.id ?? ""}
                  items={[
                    ...(ref ? [] : [{ _id: "", name: "Choose a field" }]),
                    ...otherFields.map((f) => ({ _id: f.id, name: f.label })),
                  ]}
                  onChange={(e) => {
                    const next = otherFields.find((f) => f.id === e.target.value);
                    if (next) update(index, defaultCondition(next));
                  }}
                />
              </Box>
              <IconButton
                size="small"
                aria-label="Remove condition"
                onClick={() => commit(conditions.filter((_, i) => i !== index))}
                sx={{ p: "4px", color: theme.palette.other.icon }}
              >
                <Trash2 size={14} />
              </IconButton>
            </Box>
            {ref && (
              <>
                <Select
                  id={`condition-operator-${index}`}
                  label="Condition"
                  value={operator}
                  items={operators.map((op) => ({ _id: op, name: operatorLabel(ref.type, op) }))}
                  onChange={(e) =>
                    update(index, withOperator(condition, ref, e.target.value as ConditionOperator))
                  }
                />
                {!NO_VALUE.includes(operator) &&
                  (ref.type === "select" || ref.type === "multiselect") &&
                  operator !== "one_of" && (
                    <Select
                      id={`condition-value-${index}`}
                      label="Value"
                      value={typeof condition.value === "string" ? condition.value : ""}
                      items={(ref.options ?? []).map((o) => ({ _id: o.value, name: o.label }))}
                      onChange={(e) =>
                        update(index, { ...condition, value: String(e.target.value) })
                      }
                    />
                  )}
                {operator === "one_of" &&
                  (ref.options ?? []).map((option) => {
                    const selected = Array.isArray(condition.value) ? condition.value : [];
                    const checked = selected.includes(option.value);
                    return (
                      <Checkbox
                        key={option.value}
                        id={`condition-${index}-option-${option.value}`}
                        label={option.label}
                        value={option.value}
                        isChecked={checked}
                        size="small"
                        onChange={() =>
                          update(index, {
                            ...condition,
                            value: checked
                              ? selected.filter((v) => v !== option.value)
                              : [...selected, option.value],
                          })
                        }
                      />
                    );
                  })}
                {!NO_VALUE.includes(operator) && SYMBOLS[operator] && (
                  <Field
                    id={`condition-value-${index}`}
                    label="Value"
                    type="number"
                    value={typeof condition.value === "number" ? String(condition.value) : ""}
                    onChange={(e) =>
                      update(index, {
                        ...condition,
                        value: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                )}
                {(operator === "equals" || operator === "contains") &&
                  !(ref.type === "select" || ref.type === "multiselect") && (
                    <Field
                      id={`condition-value-${index}`}
                      label="Value"
                      value={typeof condition.value === "string" ? condition.value : ""}
                      onChange={(e) => update(index, { ...condition, value: e.target.value })}
                    />
                  )}
              </>
            )}
          </Box>
        );
      })}
      {hint ? (
        <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>{hint}</Typography>
      ) : (
        <CustomizableButton
          variant="outlined"
          size="small"
          text="Add condition"
          startIcon={<Plus size={14} />}
          isDisabled={conditions.length >= MAX_CONDITIONS}
          onClick={() => commit([...conditions, defaultCondition(otherFields[0])])}
        />
      )}
    </Box>
  );
}

export default VisibilityEditor;
