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
} from "./types";
import { VisibilityEditor, visibilitySummary } from "./VisibilityEditor";
import { IntakeEntityType } from "../../../domain/intake/enums";
import { getLLMFieldGuidance } from "../../../application/repository/intakeForm.repository";
import {
  DEFAULT_DECIMALS,
  MAX_DECIMALS,
  REQUIRED_ENTITY_FIELDS,
  RISK_TAGGABLE_TYPES,
  sortFields,
  type SchemaLogicError,
} from "../../../application/utils/intakeFormLogic";
import { FormulaEditor } from "./FormulaEditor";
import { EditorSection } from "./EditorSection";

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
              borderRadius: "4px",
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
                    "borderRadius": "4px",
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
  /** Every field in the form, used for rules and formulas on earlier fields. */
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
    if (!pending) return;
    // Always the edited field: the [field] layout effect flushes before it
    // points fieldRef at another field.
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
    if (!llmKeyId || !labelAtClick) return;
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
  const earlierFields = (() => {
    const sorted = sortFields(allFields);
    const index = sorted.findIndex((candidate) => candidate.id === localField.id);
    return index < 0 ? sorted : sorted.slice(0, index);
  })();
  const numericFields = earlierFields.filter(
    (candidate) => candidate.type === "number" || candidate.type === "calculated",
  );

  const mappingItems = [
    { _id: "", name: "None" },
    ...compatibleMappings
      .filter(
        (m: EntityFieldMapping) =>
          // Allow the current field's own mapping, exclude mappings used by other fields
          m.field === localField.entityFieldMapping || !usedEntityMappings.includes(m.field),
      )
      .map((m: EntityFieldMapping) => ({ _id: m.field, name: m.label })),
  ];

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
              "borderRadius": "4px",
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
              {!isCalculated && (
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
                        title={localField.label ? "Generate with AI" : "Add a label first"}
                        placement="top"
                      >
                        <Box
                          onClick={
                            !guidanceLoading && localField.label ? generateGuidance : undefined
                          }
                          sx={{
                            "display": "flex",
                            "alignItems": "center",
                            "gap": "3px",
                            "cursor": !guidanceLoading && localField.label ? "pointer" : "default",
                            "opacity": !localField.label ? 0.4 : 1,
                            "color": theme.palette.primary.main,
                            "borderRadius": "4px",
                            "px": "6px",
                            "py": "2px",
                            "&:hover": localField.label
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
                    Shown as a tooltip next to the field label on the public form
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
              <EditorSection title="Calculation" defaultOpen>
                <FormulaEditor
                  formula={localField.formula ?? ""}
                  numericFields={numericFields}
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
                  onChange={(e) => handleChange("entityFieldMapping", String(e.target.value))}
                  items={mappingItems}
                />
                {compatibleMappings.length === 0 && (
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
              earlierFields={earlierFields}
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
