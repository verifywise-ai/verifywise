import { useState, useEffect, useLayoutEffect, useRef, useCallback, type FocusEvent } from "react";
import {
  Box,
  Typography,
  Tooltip,
  Divider,
  CircularProgress,
  IconButton,
  useTheme,
} from "@mui/material";
import { X, Plus, Trash2, Sparkles } from "lucide-react";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import { CustomizableButton } from "../../components/button/customizable-button";
import {
  FormField,
  FieldOption,
  FieldType,
  ENTITY_FIELD_MAPPINGS,
  EntityFieldMapping,
  RISK_DIMENSION_OPTIONS,
  customFieldProblemFor,
} from "./types";
import { VisibilityEditor, visibilitySummary } from "./VisibilityEditor";
import { IntakeEntityType } from "../../../domain/intake/enums";
import { getLLMFieldGuidance } from "../../../application/repository/intakeForm.repository";
import {
  DEFAULT_DECIMALS,
  MAX_DECIMALS,
  REQUIRED_ENTITY_FIELDS,
  RISK_TAGGABLE_TYPES,
  customFieldKeyOf,
  customFieldMapping,
  customFieldOptionTexts,
  isCompatibleCustomFieldType,
  isCustomFieldMapping,
  matchCustomFieldOption,
  readersOf,
  sortFields,
  type SchemaLogicError,
} from "../../../application/utils/intakeFormLogic";
import type { ICustomFieldDefinition } from "../../../domain/interfaces/i.customField";
import { FormulaEditor } from "./FormulaEditor";
import { EditorSection } from "./EditorSection";
import { radiusPx } from "../../themes/palette";

// The public form shows a placeholder only in these inputs; a dropdown always
// reads "Select an option".
const PLACEHOLDER_TYPES: ReadonlySet<FieldType> = new Set([
  "text",
  "textarea",
  "email",
  "url",
  "number",
]);

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  url: "URL",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  multiselect: "Multi-select",
  checkbox: "Checkbox",
  calculated: "Calculated",
};

const CUSTOM_FIELD_PROBLEM_TEXT = {
  missing: "This custom field no longer exists",
  incompatible: "This custom field's type does not match this question",
  options: "Some options of this question are not options of this custom field",
} as const;

/**
 * A custom select's options as question options, labelled as the custom field
 * labels them. A question option that already matches one (by value or label,
 * trimmed and case-insensitive) keeps its value, so stored answers and rules
 * that use it still hold; a new one takes the label as its value, which is
 * what approval matches answers against.
 */
export function questionOptionsFrom(
  definition: Pick<ICustomFieldDefinition, "options">,
  existing: FieldOption[] = [],
): FieldOption[] {
  const kept = new Set<FieldOption>();
  const values = new Set<string>();
  const options: FieldOption[] = [];
  for (const custom of customFieldOptionTexts(definition.options)) {
    const match = existing.find(
      (option) =>
        !kept.has(option) && matchCustomFieldOption([option.value, option.label], [custom]),
    );
    if (match) kept.add(match);
    const value = match && !values.has(match.value) ? match.value : custom.label;
    if (values.has(value)) continue;
    values.add(value);
    options.push({ value, label: custom.label });
  }
  return options;
}

/** The default answer with any option that no longer exists taken out. */
export function defaultValueWithin(
  defaultValue: FormField["defaultValue"],
  options: FieldOption[],
): FormField["defaultValue"] {
  const values = new Set(options.map((option) => option.value));
  if (Array.isArray(defaultValue)) return defaultValue.filter((value) => values.has(value));
  if (typeof defaultValue === "string" && defaultValue !== "" && !values.has(defaultValue)) {
    return undefined;
  }
  return defaultValue;
}

interface OptionsEditorProps {
  options: FieldOption[];
  onChange: (options: FieldOption[]) => void;
}

function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const theme = useTheme();
  const handleAddOption = () => {
    // Values must stay unique: rules and scoring look options up by value, and
    // counting options would reuse a deleted option's value.
    const used = new Set(options.map((option) => option.value));
    let n = options.length + 1;
    while (used.has(`option${n}`)) n++;
    const newOption: FieldOption = {
      label: `Option ${options.length + 1}`,
      value: `option${n}`,
    };
    onChange([...options, newOption]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 1) return;
    const newOptions = options.filter((_, i) => i !== index);
    onChange(newOptions);
  };

  const handleUpdateOption = (index: number, field: keyof FieldOption, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    onChange(newOptions);
  };

  return (
    <Box>
      <Typography
        sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "13px", mb: "8px" }}
      >
        Options
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {options.map((option, index) => (
          <Box
            key={index}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              p: "8px",
              backgroundColor: theme.palette.background.accent,
              borderRadius: radiusPx.sm,
              border: `1px solid ${theme.palette.border.dark}`,
            }}
          >
            {/* minWidth: 0 overrides the Field's 220px minimum so two inputs fit the panel */}
            <Field
              id={`option-label-${index}`}
              label=""
              placeholder="Label"
              value={option.label}
              onChange={(e) => handleUpdateOption(index, "label", e.target.value)}
              sx={{
                "flex": 1,
                "minWidth": 0,
                "& .MuiOutlinedInput-root": { height: 32, fontSize: "13px" },
              }}
            />
            <Field
              id={`option-value-${index}`}
              label=""
              placeholder="Value"
              value={option.value}
              onChange={(e) => handleUpdateOption(index, "value", e.target.value)}
              sx={{
                "flex": 1,
                "minWidth": 0,
                "& .MuiOutlinedInput-root": { height: 32, fontSize: "13px" },
              }}
            />
            <Tooltip title={options.length <= 1 ? "" : "Remove option"}>
              {/* span keeps the tooltip working while the button is disabled */}
              <span style={{ display: "flex", flexShrink: 0 }}>
                <IconButton
                  size="small"
                  aria-label="Remove option"
                  disabled={options.length <= 1}
                  onClick={() => handleRemoveOption(index)}
                  sx={{
                    "p": "4px",
                    "borderRadius": radiusPx.sm,
                    "color": theme.palette.status.error.text,
                    "&:hover": { backgroundColor: theme.palette.status.error.bg },
                    "&.Mui-disabled": { color: theme.palette.text.accent, opacity: 0.3 },
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ))}
      </Box>
      <CustomizableButton
        variant="text"
        onClick={handleAddOption}
        sx={{
          "mt": "8px",
          "height": 30,
          "fontSize": "12px",
          "color": theme.palette.primary.main,
          "&:hover": { backgroundColor: theme.palette.background.fill },
        }}
      >
        <Plus size={14} style={{ marginRight: 4 }} /> Add option
      </CustomizableButton>
    </Box>
  );
}

interface FieldEditorProps {
  field: FormField;
  /** Every field in the form, used for the rules and formulas on this field. */
  allFields: FormField[];
  entityType: IntakeEntityType;
  usedEntityMappings?: string[];
  llmKeyId?: number | null;
  onChange: (field: FormField) => void;
  /** Called on every edit, before the debounce sends it, so the page can enable Save at once. */
  onEdit?: () => void;
  onClose: () => void;
  /** Problems the schema checks found on this field. */
  logicErrors?: SchemaLogicError[];
  /** The entity's custom field definitions; undefined while they load. */
  customFieldDefinitions?: ICustomFieldDefinition[];
}

export function FieldEditor({
  field,
  allFields,
  entityType,
  usedEntityMappings = [],
  llmKeyId,
  onChange,
  onEdit,
  onClose,
  logicErrors = [],
  customFieldDefinitions,
}: FieldEditorProps) {
  const theme = useTheme();
  const [localField, setLocalField] = useState<FormField>(field);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keys edited here and not yet sent. They go out on the debounce, or early
  // when the editor moves to another field, closes or loses focus, and are
  // merged onto the latest field so an outside update (a save response, a
  // reorder) and the edit both survive.
  const pendingEditRef = useRef<{ fieldId: string; patch: Partial<FormField> } | null>(null);
  const fieldRef = useRef(field);
  const onChangeRef = useRef(onChange);
  const onEditRef = useRef(onEdit);

  // Declared before the [field] layout effect below, which can flush, so the
  // flush never calls the previous render's handler.
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onEditRef.current = onEdit;
  }, [onChange, onEdit]);

  const flushPendingEdit = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    const pending = pendingEditRef.current;
    pendingEditRef.current = null;
    // The [field] layout effect flushes before it points fieldRef at another
    // field; the id check keeps an edit off the wrong field if that changes.
    if (!pending || pending.fieldId !== fieldRef.current.id) return;
    onChangeRef.current({ ...fieldRef.current, ...pending.patch });
  }, []);

  // Send the previous field's edit before showing the new one; keep a same-field
  // edit on top of the update. A layout effect, so a debounce timer can never
  // run between the new field rendering and fieldRef pointing at it.
  useLayoutEffect(() => {
    const pending = pendingEditRef.current;
    if (pending && pending.fieldId !== field.id) flushPendingEdit();
    fieldRef.current = field;
    const kept = pendingEditRef.current?.patch;
    setLocalField(kept ? { ...field, ...kept } : field);
  }, [field, flushPendingEdit]);

  useEffect(() => flushPendingEdit, [flushPendingEdit]);

  const queueEdit = useCallback(
    (patch: Partial<FormField>) => {
      const fieldId = fieldRef.current.id;
      const earlier =
        pendingEditRef.current?.fieldId === fieldId ? pendingEditRef.current.patch : {};
      pendingEditRef.current = { fieldId, patch: { ...earlier, ...patch } };
      onEditRef.current?.();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(flushPendingEdit, 300);
    },
    [flushPendingEdit],
  );

  // The value the field will have once the waiting edit is sent.
  const latestValue = useCallback(<K extends keyof FormField>(key: K): FormField[K] => {
    const pending = pendingEditRef.current;
    if (pending?.fieldId === fieldRef.current.id && key in pending.patch) {
      return pending.patch[key] as FormField[K];
    }
    return fieldRef.current[key];
  }, []);

  const handleChange = <K extends keyof FormField>(key: K, value: FormField[K]) => {
    setLocalField((current) => ({ ...current, [key]: value }));
    queueEdit({ [key]: value } as Partial<FormField>);
  };

  const handleValidationChange = (key: string, value: boolean | number | string | undefined) => {
    const validation = { ...latestValue("validation"), [key]: value };
    // Remove undefined keys to keep the object clean
    if (value === undefined) {
      delete (validation as Record<string, unknown>)[key];
    }
    setLocalField((current) => ({ ...current, validation }));
    queueEdit({ validation });
  };

  // Moving focus between inputs in the editor leaves the debounce to it.
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    flushPendingEdit();
  };

  // LLM guidance generation
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  // Bumped when a request starts, another field opens or the editor closes,
  // so only the newest request for the open field can apply its result.
  const guidanceRequestRef = useRef(0);

  useLayoutEffect(() => {
    guidanceRequestRef.current += 1;
    setGuidanceLoading(false);
  }, [field.id]);

  useEffect(
    () => () => {
      guidanceRequestRef.current += 1;
    },
    [],
  );

  const generateGuidance = useCallback(async () => {
    const labelAtClick = latestValue("label");
    if (!llmKeyId || !labelAtClick?.trim()) return;
    const request = ++guidanceRequestRef.current;
    const guidanceAtClick = latestValue("guidanceText") ?? "";
    setGuidanceLoading(true);
    try {
      const result = await getLLMFieldGuidance(labelAtClick, entityType, llmKeyId);
      if (request !== guidanceRequestRef.current) return;
      const text = result.data?.guidanceText;
      // Dropped when the user renamed the field or wrote their own guidance
      // while the request ran.
      if (
        !text ||
        latestValue("label") !== labelAtClick ||
        (latestValue("guidanceText") ?? "") !== guidanceAtClick
      ) {
        return;
      }
      // Merged with any other edit made while the request ran.
      setLocalField((current) => ({ ...current, guidanceText: text }));
      queueEdit({ guidanceText: text });
      flushPendingEdit();
    } catch {
      // Silently fail — the field stays as is
    } finally {
      if (request === guidanceRequestRef.current) setGuidanceLoading(false);
    }
  }, [llmKeyId, entityType, latestValue, queueEdit, flushPendingEdit]);

  // The same blank-label rule as generateGuidance, so the button never offers a call it refuses.
  const hasGuidanceLabel = Boolean(localField.label?.trim());

  const entityMappings = ENTITY_FIELD_MAPPINGS[entityType] || [];
  const compatibleMappings = entityMappings.filter((mapping: EntityFieldMapping) =>
    mapping.requiredFieldType.includes(localField.type),
  );

  const showOptions = localField.type === "select" || localField.type === "multiselect";
  const showMinMax = localField.type === "number";
  const showMinMaxLength = localField.type === "text" || localField.type === "textarea";
  const isCalculated = localField.type === "calculated";
  const hasRules =
    Array.isArray(localField.visibility?.conditions) && localField.visibility.conditions.length > 0;
  // Rules and formulas may read any other field, except one that already
  // reads this field: picking it would make a loop.
  const otherFields = (() => {
    const sorted = sortFields(allFields);
    const readers = readersOf(sorted, localField.id);
    return sorted.filter(
      (candidate) => candidate.id !== localField.id && !readers.has(candidate.id),
    );
  })();
  const numericFields = otherFields.filter(
    (candidate) => candidate.type === "number" || candidate.type === "calculated",
  );

  const standardMappingItems = [
    { _id: "", name: "None" },
    ...compatibleMappings
      .filter(
        (m: EntityFieldMapping) =>
          // Allow the current field's own mapping, exclude mappings used by other fields
          m.field === localField.entityFieldMapping || !usedEntityMappings.includes(m.field),
      )
      .map((m: EntityFieldMapping) => ({ _id: m.field, name: m.label })),
  ];

  // Custom fields this question can fill, minus those other questions fill.
  // The question's own mapping always shows, even when it is broken, so the
  // picker never holds a value it cannot display.
  const currentMapping = localField.entityFieldMapping;
  const customMappingItems = (customFieldDefinitions ?? [])
    .filter((definition) => {
      const mapping = customFieldMapping(definition.field_key);
      if (mapping === currentMapping) return true;
      return (
        isCompatibleCustomFieldType(localField.type, definition.field_type) &&
        !usedEntityMappings.includes(mapping)
      );
    })
    .map((definition) => ({
      _id: customFieldMapping(definition.field_key),
      name: definition.label,
    }));
  if (
    isCustomFieldMapping(currentMapping) &&
    !customMappingItems.some((item) => item._id === currentMapping)
  ) {
    customMappingItems.push({ _id: currentMapping, name: customFieldKeyOf(currentMapping) });
  }
  const mappingItems = [...standardMappingItems, ...customMappingItems];
  const mappingProblem = customFieldProblemFor(localField, customFieldDefinitions);

  const handleMappingChange = (mapping: string) => {
    const patch: Partial<FormField> = { entityFieldMapping: mapping };
    // A select question takes over the custom field's options, so every
    // answer is one approval can store.
    if (isCustomFieldMapping(mapping) && showOptions) {
      const definition = customFieldDefinitions?.find(
        (d) => d.field_key === customFieldKeyOf(mapping),
      );
      const options = definition ? questionOptionsFrom(definition, localField.options ?? []) : [];
      if (options.length > 0) {
        patch.options = options;
        if (localField.defaultValue !== undefined) {
          const defaultValue = defaultValueWithin(localField.defaultValue, options);
          if (defaultValue !== localField.defaultValue) patch.defaultValue = defaultValue;
        }
      }
    }
    setLocalField((current) => ({ ...current, ...patch }));
    queueEdit(patch);
  };

  return (
    <Box
      onBlur={handleBlur}
      sx={{
        width: 325,
        height: "100%",
        borderLeft: `1px solid ${theme.palette.border.dark}`,
        backgroundColor: theme.palette.background.main,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: "8px",
          borderBottom: `1px solid ${theme.palette.border.dark}`,
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "14px" }}>
            Field settings
          </Typography>
          <Typography sx={{ color: theme.palette.other.icon, fontSize: "12px" }}>
            {FIELD_TYPE_LABELS[localField.type]}
          </Typography>
        </Box>
        <Tooltip title="Close editor">
          <Box
            onClick={onClose}
            sx={{
              "cursor": "pointer",
              "display": "flex",
              "alignItems": "center",
              "p": "4px",
              "borderRadius": radiusPx.sm,
              "&:hover": { backgroundColor: theme.palette.background.accent },
            }}
          >
            <X size={18} color={theme.palette.other.icon} />
          </Box>
        </Tooltip>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: "8px" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {logicErrors.length > 0 && (
            <Box role="alert" sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {logicErrors.map((error, index) => (
                <Typography
                  key={`${index}-${error.message}`}
                  sx={{ fontSize: "12px", color: theme.palette.status.error.text }}
                >
                  {error.message}
                </Typography>
              ))}
            </Box>
          )}
          {/* Basic settings */}
          <Box>
            <Typography
              sx={{
                fontWeight: 600,
                color: theme.palette.other.icon,
                fontSize: "10px",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                mb: "12px",
              }}
            >
              Basic settings
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Field
                id="field-label"
                label="Label"
                value={localField.label}
                onChange={(e) => handleChange("label", e.target.value)}
              />
              {PLACEHOLDER_TYPES.has(localField.type) && (
                <Field
                  id="field-placeholder"
                  label="Placeholder"
                  value={localField.placeholder || ""}
                  onChange={(e) => handleChange("placeholder", e.target.value)}
                />
              )}
              <Field
                id="field-helptext"
                label="Help text"
                value={localField.helpText || ""}
                onChange={(e) => handleChange("helpText", e.target.value)}
                rows={2}
              />
              {!isCalculated && (
                <Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: "4px",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: theme.palette.text.secondary,
                      }}
                    >
                      Guidance text
                    </Typography>
                    {llmKeyId && (
                      <Tooltip
                        title={hasGuidanceLabel ? "Generate with AI" : "Add a label first"}
                        placement="top"
                      >
                        <Box
                          onClick={
                            !guidanceLoading && hasGuidanceLabel ? generateGuidance : undefined
                          }
                          sx={{
                            "display": "flex",
                            "alignItems": "center",
                            "gap": "3px",
                            "cursor": !guidanceLoading && hasGuidanceLabel ? "pointer" : "default",
                            "opacity": !hasGuidanceLabel ? 0.4 : 1,
                            "color": theme.palette.primary.main,
                            "borderRadius": radiusPx.sm,
                            "px": "6px",
                            "py": "2px",
                            "&:hover": hasGuidanceLabel
                              ? { backgroundColor: theme.palette.background.fill }
                              : {},
                          }}
                        >
                          {guidanceLoading ? (
                            <CircularProgress
                              size={12}
                              sx={{ color: theme.palette.primary.main }}
                            />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          <Typography sx={{ fontSize: "11px", fontWeight: 500 }}>
                            {guidanceLoading ? "Generating..." : "AI"}
                          </Typography>
                        </Box>
                      </Tooltip>
                    )}
                  </Box>
                  <Field
                    id="field-guidance"
                    label=""
                    placeholder="Explain why this field matters for governance..."
                    value={localField.guidanceText || ""}
                    onChange={(e) => handleChange("guidanceText", e.target.value)}
                    rows={2}
                  />
                  <Typography sx={{ fontSize: "11px", color: theme.palette.other.icon, mt: "4px" }}>
                    Shown under the field on the public form
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          <Divider sx={{ borderColor: theme.palette.border.dark }} />

          {/* Options for select/multiselect */}
          {showOptions && (
            <>
              <OptionsEditor
                options={localField.options || []}
                onChange={(options) => handleChange("options", options)}
              />
              <Divider sx={{ borderColor: theme.palette.border.dark }} />
            </>
          )}

          {isCalculated && (
            <>
              <EditorSection title="Calculated value" defaultOpen>
                <FormulaEditor
                  formula={localField.formula ?? ""}
                  numericFields={numericFields}
                  allFields={allFields}
                  decimals={localField.decimals}
                  onChange={(formula) => handleChange("formula", formula)}
                />
                <Field
                  id="field-decimals"
                  label="Decimals"
                  type="number"
                  min={0}
                  max={MAX_DECIMALS}
                  value={localField.decimals === undefined ? "" : String(localField.decimals)}
                  placeholder={String(DEFAULT_DECIMALS)}
                  onChange={(e) => {
                    const v = e.target.value;
                    handleChange("decimals", v === "" ? undefined : Number(v));
                  }}
                />
                <Box sx={{ display: "flex", gap: "8px", minWidth: 0 }}>
                  <Field
                    id="field-prefix"
                    label="Prefix"
                    value={localField.prefix ?? ""}
                    onChange={(e) => handleChange("prefix", e.target.value || undefined)}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                  <Field
                    id="field-suffix"
                    label="Suffix"
                    value={localField.suffix ?? ""}
                    onChange={(e) => handleChange("suffix", e.target.value || undefined)}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                </Box>
              </EditorSection>
              <Divider sx={{ borderColor: theme.palette.border.dark }} />
            </>
          )}

          {!isCalculated && (
            <>
              {/* Validation settings */}
              <Box>
                <Typography
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.other.icon,
                    fontSize: "10px",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    mb: "12px",
                  }}
                >
                  Validation
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <Checkbox
                    id="field-required"
                    label={hasRules ? "Required when shown" : "Required field"}
                    isChecked={localField.validation?.required || false}
                    value="required"
                    onChange={() =>
                      handleValidationChange("required", !latestValue("validation")?.required)
                    }
                    size="small"
                  />

                  {showMinMaxLength && (
                    <Box sx={{ display: "flex", gap: "8px", minWidth: 0 }}>
                      <Field
                        id="field-minlength"
                        label="Min length"
                        type="number"
                        value={String(localField.validation?.minLength ?? "")}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleValidationChange("minLength", v === "" ? undefined : parseInt(v));
                        }}
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                      <Field
                        id="field-maxlength"
                        label="Max length"
                        type="number"
                        value={String(localField.validation?.maxLength || "")}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleValidationChange("maxLength", v === "" ? undefined : parseInt(v));
                        }}
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                    </Box>
                  )}

                  {showMinMax && (
                    <Box sx={{ display: "flex", gap: "8px", minWidth: 0 }}>
                      <Field
                        id="field-min"
                        label="Min value"
                        type="number"
                        value={String(localField.validation?.min || "")}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleValidationChange("min", v === "" ? undefined : parseInt(v));
                        }}
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                      <Field
                        id="field-max"
                        label="Max value"
                        type="number"
                        value={String(localField.validation?.max || "")}
                        onChange={(e) => {
                          const v = e.target.value;
                          handleValidationChange("max", v === "" ? undefined : parseInt(v));
                        }}
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                    </Box>
                  )}
                </Box>
              </Box>

              <Divider sx={{ borderColor: theme.palette.border.dark }} />

              {/* Entity field mapping */}
              <Box>
                <Typography
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.other.icon,
                    fontSize: "10px",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    mb: "12px",
                  }}
                >
                  Entity mapping
                </Typography>
                <Select
                  id="entity-mapping"
                  label="Map to entity field"
                  value={localField.entityFieldMapping || ""}
                  onChange={(e) => handleMappingChange(String(e.target.value))}
                  items={mappingItems}
                  dividerAfterIndex={
                    customMappingItems.length > 0 ? standardMappingItems.length : undefined
                  }
                  dividerLabel="Custom fields"
                  error={mappingProblem ? CUSTOM_FIELD_PROBLEM_TEXT[mappingProblem] : undefined}
                />
                {mappingItems.length <= 1 && (
                  <Typography
                    sx={{ color: theme.palette.text.accent, fontSize: "11px", mt: "4px" }}
                  >
                    No compatible entity fields for this field type
                  </Typography>
                )}
              </Box>
            </>
          )}
          <Divider sx={{ borderColor: theme.palette.border.dark }} />
          <EditorSection
            title="Show this field only if…"
            summary={visibilitySummary(localField.visibility)}
          >
            <VisibilityEditor
              visibility={localField.visibility}
              otherFields={otherFields}
              onChange={(visibility) => handleChange("visibility", visibility)}
              blockedReason={
                localField.entityFieldMapping &&
                (REQUIRED_ENTITY_FIELDS[entityType] ?? []).includes(localField.entityFieldMapping)
                  ? "This field is always shown: it fills a required field of the new entity"
                  : undefined
              }
            />
          </EditorSection>
          {RISK_TAGGABLE_TYPES.includes(localField.type) && (
            <EditorSection title="Risk scoring">
              <Select
                id="field-risk-dimension"
                label="Risk dimension"
                value={localField.riskDimension ?? ""}
                items={[{ _id: "", name: "None" }, ...RISK_DIMENSION_OPTIONS]}
                onChange={(e) =>
                  handleChange(
                    "riskDimension",
                    e.target.value === "" ? undefined : String(e.target.value),
                  )
                }
              />
            </EditorSection>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default FieldEditor;
