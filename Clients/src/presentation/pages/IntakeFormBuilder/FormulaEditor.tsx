import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  ClipboardEvent,
  KeyboardEvent,
} from "react";
import {
  Box,
  ClickAwayListener,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Typography,
  useTheme,
} from "@mui/material";
import type { FormField } from "./types";
import {
  evaluateFormula,
  normalizeDecimals,
  parseFormula,
} from "../../../application/utils/intakeFormLogic";
import {
  describeFormula,
  formatCalculatedValue,
  splitFormula,
  type FormulaSegment,
} from "../../../application/utils/intakeAnswerFormat";
import { useTranslation } from "../../../application/hooks/useTranslation";

interface FormulaEditorProps {
  formula: string;
  /** Number and calculated fields the formula may use: the picker lists these. */
  numericFields: FormField[];
  /**
   * Every field of the form, to name each referenced field. Defaults to
   * numericFields. A reference to a field not in this list reads as missing.
   */
  allFields?: FormField[];
  decimals?: number;
  onChange: (formula: string) => void;
}

type RefSegment = Extract<FormulaSegment, { kind: "ref" }>;

interface ChipText {
  prefix: string;
  missing: string;
}

const FIELD_ID_ATTR = "data-field-id";

/**
 * The formula a stretch of editor DOM stands for: text as typed, a chip as
 * its `{id}` reference. Browsers may wrap typed text in spans or add a <br>;
 * those are read through or dropped.
 */
function serializeNodes(nodes: ArrayLike<Node>): string {
  let out = "";
  for (const node of Array.from(nodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.nodeValue ?? "")
        .replace(/\u200B/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[\r\n]+/g, " ");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const fieldId = element.getAttribute(FIELD_ID_ATTR);
      if (fieldId) out += `{${fieldId}}`;
      else if (element.tagName !== "BR") out += serializeNodes(element.childNodes);
    }
  }
  return out;
}

/** Offset into the formula of a DOM point inside the editor. */
function formulaOffsetAt(editor: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(editor, 0);
  range.setEnd(container, offset);
  // A point inside a chip clones the chip whole, so it counts as after it.
  return serializeNodes(range.cloneContents().childNodes).length;
}

function readSelection(editor: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  return {
    start: formulaOffsetAt(editor, range.startContainer, range.startOffset),
    end: formulaOffsetAt(editor, range.endContainer, range.endOffset),
  };
}

/** Puts the caret at a formula offset; an offset inside a reference snaps past it. */
function placeCaret(editor: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const children = Array.from(editor.childNodes);
  let node: Node = editor;
  let at = children.length;
  let consumed = 0;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const length = serializeNodes([child]).length;
    if (child.nodeType === Node.TEXT_NODE) {
      if (offset <= consumed + length) {
        node = child;
        at = offset - consumed;
        break;
      }
    } else if (offset <= consumed) {
      at = index;
      break;
    } else if (offset < consumed + length) {
      at = index + 1;
      break;
    }
    consumed += length;
  }
  const range = document.createRange();
  range.setStart(node, at);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Rebuilds the editor content: text as text, each reference as a chip. */
function renderSegments(
  editor: HTMLElement,
  segments: FormulaSegment[],
  labels: Map<string, string>,
  text: ChipText,
) {
  const nodes = segments.map((segment) => {
    if (segment.kind === "text") return document.createTextNode(segment.text);
    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.className = "formula-chip";
    chip.setAttribute(FIELD_ID_ATTR, segment.fieldId);
    const label = labels.get(segment.fieldId);
    if (label === undefined) {
      chip.setAttribute("data-missing", "true");
      chip.textContent = text.missing;
    } else {
      const prefix = document.createElement("span");
      prefix.className = "formula-chip-prefix";
      prefix.textContent = `${text.prefix} `;
      chip.append(prefix, label);
    }
    return chip;
  });
  editor.replaceChildren(...nodes);
}

/**
 * The formula of a calculated field. The stored formula references fields as
 * `{id}`; the editor shows each reference as a chip with the field name, read
 * from the current fields at render time, so renaming a field renames its chip.
 */
export function FormulaEditor({
  formula,
  numericFields,
  allFields,
  decimals,
  onChange,
}: FormulaEditorProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const menuId = `${baseId}-picker`;
  const summaryId = `${baseId}-summary`;
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number>(formula.length);
  const composingRef = useRef(false);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const parsed = formula.trim() === "" ? null : parseFormula(formula);
  const segments = useMemo(() => splitFormula(formula), [formula]);
  const labelFields = allFields ?? numericFields;
  const chipText = useMemo<ChipText>(
    () => ({ prefix: t("Field:"), missing: t("Missing field") }),
    [t],
  );

  // Callers often pass a fresh array each render. Keyed on the names of the
  // referenced fields, the editor rebuilds only when what it shows changes,
  // so an unrelated render never moves the caret.
  const labelsKey = JSON.stringify(
    segments
      .filter((segment): segment is RefSegment => segment.kind === "ref")
      .map((segment) => labelFields.find((field) => field.id === segment.fieldId)?.label ?? null),
  );
  const labels = useMemo(
    () => new Map(labelFields.map((field) => [field.id, field.label])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labelsKey],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || composingRef.current) return;
    renderSegments(editor, segments, labels, chipText);
    if (document.activeElement === editor) {
      placeCaret(editor, Math.min(caretRef.current, formula.length));
    }
  }, [segments, labels, chipText, formula.length]);

  // Remember where the caret is, so a field picked with the mouse lands there
  // and a rebuild puts the caret back.
  useEffect(() => {
    const handleSelectionChange = () => {
      const editor = editorRef.current;
      if (!editor || document.activeElement !== editor) return;
      const selection = readSelection(editor);
      if (selection) caretRef.current = selection.end;
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const closePicker = () => setPickerAnchor(null);

  const applyEdit = (next: string, caret: number) => {
    caretRef.current = caret;
    onChange(next);
  };

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor || composingRef.current) return;
    const next = serializeNodes(editor.childNodes);
    const caret = readSelection(editor)?.end ?? next.length;
    caretRef.current = caret;
    onChange(next);
    // Typing "{" opens the picker of fields the formula may use; typing
    // anything else closes it, so the author can keep typing the reference.
    if (next.length === formula.length + 1 && next[caret - 1] === "{") {
      setActiveIndex(0);
      setPickerAnchor(wrapperRef.current);
    } else if (pickerAnchor) {
      closePicker();
    }
  };

  const insertField = (fieldId: string) => {
    const caret = Math.min(caretRef.current, formula.length);
    const before = formula.slice(0, caret);
    const after = formula.slice(caret);
    const base = before.endsWith("{") ? before.slice(0, -1) : before;
    const nextCaret = base.length + fieldId.length + 2;
    applyEdit(`${base}{${fieldId}}${after}`, nextCaret);
    closePicker();
    // Back to the editor, with the caret just after the inserted reference.
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      placeCaret(editor, nextCaret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    // The picker never takes focus, so its own key handling never runs.
    // Handle it here, and stop Escape so it only closes the picker.
    if (pickerAnchor) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePicker();
        return;
      }
      if (numericFields.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => (index + step + numericFields.length) % numericFields.length);
        return;
      }
      if (event.key === "Enter" && numericFields[activeIndex]) {
        event.preventDefault();
        insertField(numericFields[activeIndex].id);
        return;
      }
    }
    // A formula is one line.
    if (event.key === "Enter") {
      event.preventDefault();
      return;
    }

    const isDelete = event.key === "Backspace" || event.key === "Delete";
    const isArrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
    if (!isDelete && !isArrow) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const selection = readSelection(editor);
    if (!selection) return;

    if (isDelete && selection.start !== selection.end) {
      event.preventDefault();
      applyEdit(formula.slice(0, selection.start) + formula.slice(selection.end), selection.start);
      closePicker();
      return;
    }
    if (selection.start !== selection.end || (isArrow && event.shiftKey)) return;

    // A reference is one unit: delete it whole, step over it in one press.
    const backward = event.key === "Backspace" || event.key === "ArrowLeft";
    const ref = segments.find(
      (segment): segment is RefSegment =>
        segment.kind === "ref" &&
        (backward ? segment.end === selection.start : segment.start === selection.start),
    );
    if (!ref) return;
    event.preventDefault();
    if (isDelete) {
      applyEdit(formula.slice(0, ref.start) + formula.slice(ref.end), ref.start);
      closePicker();
    } else {
      const target = backward ? ref.start : ref.end;
      caretRef.current = target;
      placeCaret(editor, target);
    }
  };

  // Plain text only: pasted markup would bring its own elements and styles.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    const pasted = event.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " ");
    const selection = readSelection(editor) ?? { start: formula.length, end: formula.length };
    applyEdit(
      formula.slice(0, selection.start) + pasted + formula.slice(selection.end),
      selection.start + pasted.length,
    );
    closePicker();
  };

  const preview =
    parsed && parsed.ok
      ? evaluateFormula(
          parsed.ast,
          Object.fromEntries(parsed.refs.map((ref) => [ref, 1])),
          normalizeDecimals(decimals),
        )
      : null;

  // Parse positions count characters of the stored formula, ids included, so
  // they mean nothing next to chips. Name what comes before the problem instead.
  const errorContext =
    parsed && !parsed.ok && parsed.position > 0 && parsed.position < formula.length
      ? describeFormula(formula.slice(0, parsed.position), labelFields).replace(/^= /, "")
      : "";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <Typography
        component="span"
        id={labelId}
        onClick={() => editorRef.current?.focus()}
        sx={{
          color: theme.palette.text.secondary,
          fontWeight: 500,
          fontSize: "13px",
          height: "22px",
          display: "block",
        }}
      >
        Formula
      </Typography>
      <Box
        ref={wrapperRef}
        sx={{
          "position": "relative",
          "border": `1px solid ${theme.palette.border.dark}`,
          "borderRadius": "4px",
          "backgroundColor": theme.palette.background.main,
          "transition": "border-color 150ms ease-in-out, box-shadow 150ms ease-in-out",
          "&:focus-within": {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 0 0 3px ${theme.palette.primary.main}1A`,
          },
          "& .formula-chip": {
            display: "inline-block",
            padding: "0 6px",
            margin: "0 2px",
            borderRadius: "4px",
            lineHeight: "20px",
            fontSize: "13px",
            whiteSpace: "nowrap",
            cursor: "default",
            color: theme.palette.text.primary,
            backgroundColor: theme.palette.background.accent,
            border: `1px solid ${theme.palette.border.dark}`,
          },
          "& .formula-chip[data-missing='true']": {
            color: theme.palette.status.error.text,
            backgroundColor: theme.palette.status.error.bg,
            borderColor: theme.palette.status.error.border,
          },
          // Read by screen readers ("Field: Monthly users"), not shown.
          "& .formula-chip-prefix": {
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
          },
        }}
      >
        <Box
          ref={editorRef}
          id="field-formula"
          role="textbox"
          aria-labelledby={labelId}
          aria-describedby={parsed ? summaryId : undefined}
          aria-placeholder={t("Type { to insert a field")}
          aria-invalid={Boolean(parsed && !parsed.ok)}
          aria-haspopup="menu"
          aria-expanded={Boolean(pickerAnchor)}
          aria-controls={pickerAnchor ? menuId : undefined}
          aria-activedescendant={
            pickerAnchor && numericFields[activeIndex] ? `${menuId}-${activeIndex}` : undefined
          }
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          tabIndex={0}
          // The editor text is the formula itself: never machine-translate it.
          data-vw-no-translate="true"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          // Picker items keep focus here on mouse down, so a blur means the
          // author left the editor, by Tab or a click elsewhere.
          onBlur={closePicker}
          onDrop={(event) => event.preventDefault()}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            handleInput();
          }}
          sx={{
            minHeight: "34px",
            padding: "6px 10px",
            boxSizing: "border-box",
            fontSize: "13px",
            lineHeight: "20px",
            color: theme.palette.text.secondary,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            outline: "none",
          }}
        />
        {formula === "" && (
          <Typography
            aria-hidden
            sx={{
              position: "absolute",
              top: "7px",
              left: "11px",
              fontSize: "13px",
              lineHeight: "20px",
              color: theme.palette.text.tertiary,
              pointerEvents: "none",
            }}
          >
            {"Type { to insert a field"}
          </Typography>
        )}
      </Box>
      {/* Not a Menu: a modal would hide the focused editor from screen
          readers. The keyboard stays in the editor, where arrow keys and
          Enter move through and pick from this list. */}
      <Popper
        open={Boolean(pickerAnchor)}
        anchorEl={pickerAnchor}
        placement="bottom-start"
        sx={{ zIndex: theme.zIndex.modal }}
      >
        <ClickAwayListener onClickAway={closePicker}>
          <Paper
            sx={{
              mt: "4px",
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              maxHeight: "240px",
              overflowY: "auto",
            }}
          >
            <MenuList id={menuId} autoFocusItem={false}>
              {numericFields.length === 0 ? (
                <MenuItem disabled>Add a number field above this one first</MenuItem>
              ) : (
                numericFields.map((field, index) => (
                  <MenuItem
                    key={field.id}
                    id={`${menuId}-${index}`}
                    selected={index === activeIndex}
                    // Keep focus, and with it the caret, in the editor.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertField(field.id)}
                    sx={{ fontSize: "13px" }}
                  >
                    {field.label}
                  </MenuItem>
                ))
              )}
            </MenuList>
          </Paper>
        </ClickAwayListener>
      </Popper>
      {parsed && !parsed.ok && (
        <Typography
          id={summaryId}
          sx={{ fontSize: "13px", color: theme.palette.status.error.text }}
        >
          {errorContext ? `${parsed.error} after “${errorContext}”` : parsed.error}
        </Typography>
      )}
      {parsed && parsed.ok && (
        <Box id={summaryId}>
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
            {describeFormula(formula, labelFields)}
          </Typography>
          <Box sx={{ display: "flex", gap: "4px", mt: "2px" }}>
            <Typography sx={{ fontSize: "13px", color: theme.palette.text.accent }}>
              Result with every input set to 1:
            </Typography>
            <Typography sx={{ fontSize: "13px", color: theme.palette.text.accent }}>
              {formatCalculatedValue(preview, { decimals })}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default FormulaEditor;
