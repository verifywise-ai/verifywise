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
   * Every field of the form, to name a referenced field the formula may not
   * use. Defaults to numericFields.
   */
  allFields?: FormField[];
  decimals?: number;
  onChange: (formula: string) => void;
}

type RefSegment = Extract<FormulaSegment, { kind: "ref" }>;

/** usable: in numericFields. unusable: on the form but not usable here. */
type ChipState = "usable" | "unusable" | "missing";

interface ChipInfo {
  state: ChipState;
  name: string;
}

interface ChipText {
  prefix: string;
  missing: string;
  unusable: string;
}

interface Snapshot {
  formula: string;
  caret: number;
}

/** Consecutive edits of one kind within this window undo as one step. */
const COALESCE_MS = 1000;
const MAX_HISTORY = 100;
const FIELD_ID_ATTR = "data-field-id";
// Spacer text around chips, so the caret has a place before, between and
// after them. Never part of the formula.
const ZWSP = "\u200B";

type EditKind = "type" | "delete" | "other";

/**
 * The formula a stretch of editor DOM stands for: text as typed, a chip as
 * its `{id}` reference. Spacers are dropped; browsers may wrap typed text in
 * spans or add a <br>, which are read through or dropped.
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

/**
 * Puts the caret at a formula offset. It lands in a text node, past any
 * spacers, so it sits right against a neighbouring chip; an offset inside a
 * reference snaps past it.
 */
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
        const text = child.nodeValue ?? "";
        let k = 0;
        let seen = 0;
        while (seen < offset - consumed && k < text.length) {
          if (text[k] !== ZWSP) seen += 1;
          k += 1;
        }
        while (k < text.length && text[k] === ZWSP) k += 1;
        node = child;
        at = k;
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

function createChip(fieldId: string, info: ChipInfo, text: ChipText): HTMLElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.className = "formula-chip";
  chip.setAttribute(FIELD_ID_ATTR, fieldId);
  chip.setAttribute("data-state", info.state);
  if (info.state === "missing") {
    chip.textContent = text.missing;
    return chip;
  }
  // Read by screen readers ("Field: Monthly users"), not shown.
  const prefix = document.createElement("span");
  prefix.className = "formula-chip-hidden";
  prefix.textContent = `${text.prefix} `;
  chip.append(prefix, info.name);
  if (info.state === "unusable") {
    chip.title = text.unusable;
    const reason = document.createElement("span");
    reason.className = "formula-chip-hidden";
    reason.textContent = ` (${text.unusable})`;
    chip.append(reason);
  }
  return chip;
}

/** Rebuilds the editor content: text as text, each reference as a chip between spacers. */
function renderSegments(
  editor: HTMLElement,
  segments: FormulaSegment[],
  chips: ChipInfo[],
  text: ChipText,
) {
  const nodes: Node[] = [];
  const lastText = (): Text | null => {
    const last = nodes[nodes.length - 1];
    return last && last.nodeType === Node.TEXT_NODE ? (last as Text) : null;
  };
  let chipIndex = 0;
  for (const segment of segments) {
    if (segment.kind === "text") {
      const previous = lastText();
      if (previous) previous.appendData(segment.text);
      else nodes.push(document.createTextNode(segment.text));
      continue;
    }
    const previous = lastText();
    if (previous) previous.appendData(ZWSP);
    else nodes.push(document.createTextNode(ZWSP));
    nodes.push(createChip(segment.fieldId, chips[chipIndex], text));
    chipIndex += 1;
    nodes.push(document.createTextNode(ZWSP));
  }
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
  const composingRef = useRef(false);
  /** Caret to restore after the next rebuild, for edits made here. */
  const pendingCaretRef = useRef<number | null>(null);
  /** Offset of the "{" the picker was opened for. */
  const braceRef = useRef<number | null>(null);
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const lastEditRef = useRef<{ kind: EditKind; at: number } | null>(null);
  /** The formula this editor last emitted, to tell outside changes apart. */
  const emittedRef = useRef(formula);
  /** What a native input is about to change, recorded on beforeinput. */
  const nativeEditRef = useRef<{ kind: EditKind; caret: number } | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const parsed = formula.trim() === "" ? null : parseFormula(formula);
  const segments = useMemo(() => splitFormula(formula), [formula]);
  const chipText = useMemo<ChipText>(
    () => ({
      prefix: t("Field:"),
      missing: t("Missing field"),
      unusable: t("Not usable in this formula"),
    }),
    [t],
  );
  const unnamed = t("Unnamed field");

  const fieldInfo = useMemo(() => {
    const usable = new Set(numericFields.map((field) => field.id));
    const info = new Map<string, ChipInfo>();
    for (const field of [...(allFields ?? []), ...numericFields]) {
      info.set(field.id, {
        state: usable.has(field.id) ? "usable" : "unusable",
        name: field.label.trim() === "" ? unnamed : field.label,
      });
    }
    return info;
  }, [allFields, numericFields, unnamed]);

  const refs = segments.filter((segment): segment is RefSegment => segment.kind === "ref");
  // Callers often pass fresh field arrays each render. The editor rebuilds
  // only when what its chips show changes, so an unrelated render leaves the
  // DOM and the caret alone.
  const chipsKey = JSON.stringify(
    refs.map(
      (ref): ChipInfo => fieldInfo.get(ref.fieldId) ?? { state: "missing", name: chipText.missing },
    ),
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || composingRef.current) return;
    if (formula !== emittedRef.current) {
      // Changed from outside: the history no longer applies.
      undoRef.current = [];
      redoRef.current = [];
      lastEditRef.current = null;
      emittedRef.current = formula;
    }
    const focused = document.activeElement === editor;
    const caret = pendingCaretRef.current ?? (focused ? readSelection(editor)?.end : undefined);
    pendingCaretRef.current = null;
    renderSegments(editor, splitFormula(formula), JSON.parse(chipsKey) as ChipInfo[], chipText);
    if (focused) placeCaret(editor, Math.min(caret ?? formula.length, formula.length));
  }, [formula, chipsKey, chipText]);

  const closePicker = () => {
    braceRef.current = null;
    setPickerAnchor(null);
  };

  const emit = (next: string, caret: number) => {
    pendingCaretRef.current = caret;
    emittedRef.current = next;
    onChange(next);
  };

  /** Records an edit for undo, then emits it. */
  const commit = (next: string, caret: number, kind: EditKind, before: Snapshot) => {
    if (next === formula) return;
    const now = Date.now();
    const last = lastEditRef.current;
    const coalesce =
      kind !== "other" && last !== null && last.kind === kind && now - last.at < COALESCE_MS;
    if (!coalesce) {
      undoRef.current = [...undoRef.current, before].slice(-MAX_HISTORY);
    }
    redoRef.current = [];
    lastEditRef.current = { kind, at: now };
    emit(next, caret);
  };

  const currentCaret = () => {
    const editor = editorRef.current;
    return (editor && readSelection(editor)?.end) ?? formula.length;
  };

  const undo = () => {
    const previous = undoRef.current[undoRef.current.length - 1];
    if (!previous) return;
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, { formula, caret: currentCaret() }];
    lastEditRef.current = null;
    closePicker();
    emit(previous.formula, previous.caret);
  };

  const redo = () => {
    const next = redoRef.current[redoRef.current.length - 1];
    if (!next) return;
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, { formula, caret: currentCaret() }];
    lastEditRef.current = null;
    closePicker();
    emit(next.formula, next.caret);
  };

  // React has no beforeinput with inputType, so listen natively: to catch
  // the browser undo and redo (menu, gestures), and to record where the
  // caret was before a typed change.
  const historyRef = useRef({ undo, redo, formula });
  useLayoutEffect(() => {
    historyRef.current = { undo, redo, formula };
  });
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return undefined;
    const handleBeforeInput = (event: Event) => {
      const inputType = (event as InputEvent).inputType;
      if (inputType === "historyUndo" || inputType === "historyRedo") {
        event.preventDefault();
        if (inputType === "historyUndo") historyRef.current.undo();
        else historyRef.current.redo();
        return;
      }
      const kind: EditKind =
        inputType === "insertText" ? "type" : inputType?.startsWith("delete") ? "delete" : "other";
      nativeEditRef.current = {
        kind,
        caret: readSelection(editor)?.end ?? historyRef.current.formula.length,
      };
    };
    editor.addEventListener("beforeinput", handleBeforeInput);
    return () => editor.removeEventListener("beforeinput", handleBeforeInput);
  }, []);

  // Keep the highlighted picker item in view while arrowing through a long list.
  useEffect(() => {
    if (!pickerAnchor) return;
    document.getElementById(`${menuId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [pickerAnchor, activeIndex, menuId]);

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor || composingRef.current) return;
    const next = serializeNodes(editor.childNodes);
    const caret = readSelection(editor)?.end ?? next.length;
    const native = nativeEditRef.current;
    nativeEditRef.current = null;
    const before = { formula, caret: native?.caret ?? caret };
    // Typing "{" opens the picker of fields the formula may use; typing
    // anything else closes it, so the author can keep typing the reference.
    const openedBrace = next.length === formula.length + 1 && next[caret - 1] === "{";
    commit(next, caret, native?.kind ?? "other", before);
    if (openedBrace) {
      braceRef.current = caret - 1;
      setActiveIndex(0);
      setPickerAnchor(wrapperRef.current);
    } else if (pickerAnchor) {
      closePicker();
    }
  };

  const insertField = (fieldId: string) => {
    const brace = braceRef.current;
    const hasBrace = brace !== null && formula[brace] === "{";
    const base = hasBrace ? formula.slice(0, brace) + formula.slice(brace + 1) : formula;
    const at = hasBrace ? brace : Math.min(currentCaret(), formula.length);
    const nextCaret = at + fieldId.length + 2;
    commit(`${base.slice(0, at)}{${fieldId}}${base.slice(at)}`, nextCaret, "other", {
      formula,
      caret: hasBrace ? brace + 1 : at,
    });
    closePicker();
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor) editor.focus();
  };

  // The picker belongs to the "{" just typed: once the caret leaves the spot
  // right after it (Home, End, a click), close it.
  const closePickerIfCaretMoved = () => {
    const editor = editorRef.current;
    if (!pickerAnchor || !editor) return;
    const selection = readSelection(editor);
    const brace = braceRef.current;
    if (
      !selection ||
      brace === null ||
      selection.start !== selection.end ||
      selection.end !== brace + 1
    ) {
      closePicker();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    const key = event.key;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (event.ctrlKey && !event.altKey && key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    // The picker never takes focus, so its own key handling never runs.
    // Handle it here, and stop Escape so it only closes the picker.
    if (pickerAnchor) {
      if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePicker();
        return;
      }
      if (numericFields.length > 0 && (key === "ArrowDown" || key === "ArrowUp")) {
        event.preventDefault();
        const step = key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => (index + step + numericFields.length) % numericFields.length);
        return;
      }
      if (key === "Enter" && numericFields[activeIndex]) {
        event.preventDefault();
        insertField(numericFields[activeIndex].id);
        return;
      }
    }
    // A formula is one line.
    if (key === "Enter") {
      event.preventDefault();
      return;
    }

    const isDelete = key === "Backspace" || key === "Delete";
    const isArrow = key === "ArrowLeft" || key === "ArrowRight";
    if (!isDelete && !isArrow) return;
    // Word and line moves and deletes stay with the browser.
    if (event.altKey || mod) return;
    const selection = readSelection(editor);
    if (!selection) return;
    if (isArrow) closePicker();

    if (isDelete && selection.start !== selection.end) {
      event.preventDefault();
      commit(
        formula.slice(0, selection.start) + formula.slice(selection.end),
        selection.start,
        "delete",
        { formula, caret: selection.end },
      );
      closePicker();
      return;
    }
    if (selection.start !== selection.end || (isArrow && event.shiftKey)) return;

    // Move and delete by formula character, a reference being one unit, so
    // spacers never swallow a key press.
    const caret = selection.start;
    const backward = key === "Backspace" || key === "ArrowLeft";
    const ref = refs.find((segment) =>
      backward ? segment.end === caret : segment.start === caret,
    );
    const from = backward ? (ref?.start ?? Math.max(caret - 1, 0)) : caret;
    const to = backward ? caret : (ref?.end ?? Math.min(caret + 1, formula.length));
    event.preventDefault();
    if (isDelete) {
      if (from === to) return;
      commit(formula.slice(0, from) + formula.slice(to), from, "delete", { formula, caret });
      closePicker();
    } else {
      placeCaret(editor, backward ? from : to);
    }
  };

  const selectedFormula = () => {
    const editor = editorRef.current;
    const selection = editor ? readSelection(editor) : null;
    if (!selection || selection.start === selection.end) return null;
    return { ...selection, text: formula.slice(selection.start, selection.end) };
  };

  // Copy the references themselves, so pasting keeps them as fields.
  const handleCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selected = selectedFormula();
    if (!selected) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", selected.text);
  };

  const handleCut = (event: ClipboardEvent<HTMLDivElement>) => {
    const selected = selectedFormula();
    if (!selected) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", selected.text);
    commit(
      formula.slice(0, selected.start) + formula.slice(selected.end),
      selected.start,
      "other",
      {
        formula,
        caret: selected.end,
      },
    );
    closePicker();
  };

  // Plain text only: pasted markup would bring its own elements and styles.
  // Pasted {id} references become chips.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    const pasted = event.clipboardData
      .getData("text/plain")
      .replace(/\u200B/g, "")
      .replace(/[\r\n]+/g, " ");
    const selection = readSelection(editor) ?? { start: formula.length, end: formula.length };
    commit(
      formula.slice(0, selection.start) + pasted + formula.slice(selection.end),
      selection.start + pasted.length,
      "other",
      { formula, caret: selection.end },
    );
    closePicker();
  };

  const namedFields = Array.from(fieldInfo, ([id, info]) => ({ id, label: info.name }));
  const allUsable = refs.every((ref) => fieldInfo.get(ref.fieldId)?.state === "usable");
  // As the evaluator does: a reference it has no value for gives no result.
  const preview =
    parsed && parsed.ok && allUsable
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
      ? describeFormula(formula.slice(0, parsed.position), namedFields).replace(/^= /, "")
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
          "& .formula-chip:not([data-state='usable'])": {
            color: theme.palette.status.error.text,
            backgroundColor: theme.palette.status.error.bg,
            borderColor: theme.palette.status.error.border,
          },
          "& .formula-chip-hidden": {
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
          onKeyUp={closePickerIfCaretMoved}
          onMouseUp={closePickerIfCaretMoved}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          // The picker keeps focus here on mouse down, so a blur means the
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
            // Keep focus, and with it the caret, in the editor: on items,
            // padding and the scrollbar alike.
            onMouseDown={(event) => event.preventDefault()}
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
                <MenuItem disabled>Add a number field first</MenuItem>
              ) : (
                numericFields.map((field, index) => (
                  <MenuItem
                    key={field.id}
                    id={`${menuId}-${index}`}
                    selected={index === activeIndex}
                    onClick={() => insertField(field.id)}
                    sx={{ fontSize: "13px" }}
                  >
                    {field.label.trim() === "" ? unnamed : field.label}
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
          {parsed.error}
          {errorContext && `. ${t("The problem is just after")} “${errorContext}”`}
        </Typography>
      )}
      {parsed && parsed.ok && (
        <Box id={summaryId}>
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
            {describeFormula(formula, namedFields)}
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
