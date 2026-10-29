import { useRef, useState, ChangeEvent, KeyboardEvent } from "react";
import { Box, Menu, MenuItem, Typography, useTheme } from "@mui/material";
import Field from "../../components/Inputs/Field";
import type { FormField } from "./types";
import {
  evaluateFormula,
  normalizeDecimals,
  parseFormula,
} from "../../../application/utils/intakeFormLogic";
import {
  describeFormula,
  formatCalculatedValue,
} from "../../../application/utils/intakeAnswerFormat";

interface FormulaEditorProps {
  formula: string;
  /** Number and calculated fields other than the one being edited. */
  numericFields: FormField[];
  decimals?: number;
  onChange: (formula: string) => void;
}

export function FormulaEditor({ formula, numericFields, decimals, onChange }: FormulaEditorProps) {
  const theme = useTheme();
  const caretRef = useRef<number>(formula.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const parsed = formula.trim() === "" ? null : parseFormula(formula);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    const caret = event.target.selectionStart ?? next.length;
    caretRef.current = caret;
    onChange(next);
    // Typing "{" opens the picker of fields the formula may use; typing
    // anything else closes it, so the author can keep typing the reference.
    if (next.length === formula.length + 1 && next[caret - 1] === "{") {
      setPickerAnchor(event.target);
    } else if (pickerAnchor) {
      setPickerAnchor(null);
    }
  };

  // The picker never takes focus, so its own Escape handling never runs.
  // Close it here, and stop the key so Escape only closes the picker.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && pickerAnchor) {
      event.preventDefault();
      event.stopPropagation();
      setPickerAnchor(null);
    }
  };

  const insertField = (fieldId: string) => {
    const caret = Math.min(caretRef.current, formula.length);
    const before = formula.slice(0, caret);
    const after = formula.slice(caret);
    const base = before.endsWith("{") ? before.slice(0, -1) : before;
    onChange(`${base}{${fieldId}}${after}`);
    setPickerAnchor(null);
    // Back to the input, with the caret just after the inserted reference.
    const nextCaret = base.length + fieldId.length + 2;
    caretRef.current = nextCaret;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const preview =
    parsed && parsed.ok
      ? evaluateFormula(
          parsed.ast,
          Object.fromEntries(parsed.refs.map((ref) => [ref, 1])),
          normalizeDecimals(decimals),
        )
      : null;

  return (
    <Box>
      <Field
        ref={inputRef}
        id="field-formula"
        label="Formula"
        value={formula}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type { to insert a field"
      />
      <Menu
        anchorEl={pickerAnchor}
        open={Boolean(pickerAnchor)}
        onClose={() => setPickerAnchor(null)}
        // Keep the keyboard in the formula input: the picker is for the mouse.
        autoFocus={false}
        disableAutoFocusItem
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
      >
        {numericFields.length === 0 ? (
          <MenuItem disabled>Add a number field first</MenuItem>
        ) : (
          numericFields.map((field) => (
            <MenuItem
              key={field.id}
              onClick={() => insertField(field.id)}
              sx={{ fontSize: "13px" }}
            >
              {field.label}
            </MenuItem>
          ))
        )}
      </Menu>
      {parsed && !parsed.ok && (
        <Typography sx={{ fontSize: "11px", color: theme.palette.status.error.text, mt: "4px" }}>
          {`${parsed.error} at position ${parsed.position + 1}`}
        </Typography>
      )}
      {parsed && parsed.ok && (
        <>
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary, mt: "4px" }}>
            {describeFormula(formula, numericFields)}
          </Typography>
          <Box sx={{ display: "flex", gap: "4px", mt: "2px" }}>
            <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
              Result with every input set to 1:
            </Typography>
            <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
              {formatCalculatedValue(preview, { decimals })}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

export default FormulaEditor;
