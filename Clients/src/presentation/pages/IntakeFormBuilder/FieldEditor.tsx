import { useState, useEffect, useRef, useCallback } from "react";
import { Box, Typography, Tooltip, Divider, CircularProgress, useTheme } from "@mui/material";
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
} from "./types";
import { IntakeEntityType } from "../../../domain/intake/enums";
import { getLLMFieldGuidance } from "../../../application/repository/intakeForm.repository";

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
};

interface OptionsEditorProps {
  options: FieldOption[];
  onChange: (options: FieldOption[]) => void;
}

function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const theme = useTheme();
  const handleAddOption = () => {
    const newOption: FieldOption = {
      label: `Option ${options.length + 1}`,
      value: `option${options.length + 1}`,
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
      <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "13px", mb: "8px" }}>
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
            <Box sx={{ flex: 1 }}>
              <Field
                id={`option-label-${index}`}
                label=""
                placeholder="Label"
                value={option.label}
                onChange={(e) => handleUpdateOption(index, "label", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { height: 32, fontSize: "13px" } }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Field
                id={`option-value-${index}`}
                label=""
                placeholder="Value"
                value={option.value}
                onChange={(e) => handleUpdateOption(index, "value", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { height: 32, fontSize: "13px" } }}
              />
            </Box>
            <Tooltip title={options.length <= 1 ? "" : "Remove option"}>
              <Box
                onClick={() => handleRemoveOption(index)}
                sx={{
                  cursor: options.length <= 1 ? "default" : "pointer",
                  opacity: options.length <= 1 ? 0.3 : 1,
                  display: "flex",
                  alignItems: "center",
                  p: "4px",
                  borderRadius: "4px",
                  "&:hover": options.length > 1 ? { backgroundColor: theme.palette.status.error.bg } : {},
                }}
              >
                <Trash2 size={14} color={options.length <= 1 ? theme.palette.text.accent : theme.palette.status.error.text} />
              </Box>
            </Tooltip>
          </Box>
        ))}
      </Box>
      <CustomizableButton
        variant="text"
        onClick={handleAddOption}
        sx={{
          mt: "8px",
          height: 30,
          fontSize: "12px",
          color: theme.palette.primary.main,
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
  entityType: IntakeEntityType;
  usedEntityMappings?: string[];
  llmKeyId?: number | null;
  onChange: (field: FormField) => void;
  onClose: () => void;
}

export function FieldEditor({ field, entityType, usedEntityMappings = [], llmKeyId, onChange, onClose }: FieldEditorProps) {
  const theme = useTheme();
  const [localField, setLocalField] = useState<FormField>(field);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending debounce when field changes to prevent stale updates
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setLocalField(field);
  }, [field]);

  // Flush pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const debouncedOnChange = useCallback(
    (updated: FormField) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        onChange(updated);
      }, 300);
    },
    [onChange]
  );

  const handleChange = <K extends keyof FormField>(key: K, value: FormField[K]) => {
    const updated = { ...localField, [key]: value };
    setLocalField(updated);
    debouncedOnChange(updated);
  };

  const handleValidationChange = (key: string, value: boolean | number | string | undefined) => {
    const validation = { ...localField.validation, [key]: value };
    // Remove undefined keys to keep the object clean
    if (value === undefined) {
      delete (validation as Record<string, unknown>)[key];
    }
    const updated = { ...localField, validation };
    setLocalField(updated);
    debouncedOnChange(updated);
  };

  // LLM guidance generation
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  const generateGuidance = useCallback(async () => {
    if (!llmKeyId || !localField.label) return;
    setGuidanceLoading(true);
    try {
      const result = await getLLMFieldGuidance(localField.label, entityType, llmKeyId);
      const text = result.data?.guidanceText;
      if (text) {
        const updated = { ...localField, guidanceText: text };
        setLocalField(updated);
        onChange(updated);
      }
    } catch {
      // Silently fail — the field stays as is
    } finally {
      setGuidanceLoading(false);
    }
  }, [llmKeyId, localField, entityType, onChange]);

  const entityMappings = ENTITY_FIELD_MAPPINGS[entityType] || [];
  const compatibleMappings = entityMappings.filter((mapping: EntityFieldMapping) =>
    mapping.requiredFieldType.includes(localField.type)
  );

  const showOptions = localField.type === "select" || localField.type === "multiselect";
  const showMinMax = localField.type === "number";
  const showMinMaxLength = localField.type === "text" || localField.type === "textarea";

  const mappingItems = [
    { _id: "", name: "None" },
    ...compatibleMappings
      .filter((m: EntityFieldMapping) =>
        // Allow the current field's own mapping, exclude mappings used by other fields
        m.field === localField.entityFieldMapping || !usedEntityMappings.includes(m.field)
      )
      .map((m: EntityFieldMapping) => ({ _id: m.field, name: m.label })),
  ];

  return (
    <Box
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
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              p: "4px",
              borderRadius: "4px",
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
              <Field
                id="field-placeholder"
                label="Placeholder"
                value={localField.placeholder || ""}
                onChange={(e) => handleChange("placeholder", e.target.value)}
              />
              <Field
                id="field-helptext"
                label="Help text"
                value={localField.helpText || ""}
                onChange={(e) => handleChange("helpText", e.target.value)}
                rows={2}
              />
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "4px" }}>
                  <Typography sx={{ fontSize: "13px", fontWeight: 500, color: theme.palette.text.secondary }}>
                    Guidance text
                  </Typography>
                  {llmKeyId && (
                    <Tooltip title={localField.label ? "Generate with AI" : "Add a label first"} placement="top">
                      <Box
                        onClick={!guidanceLoading && localField.label ? generateGuidance : undefined}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          cursor: !guidanceLoading && localField.label ? "pointer" : "default",
                          opacity: !localField.label ? 0.4 : 1,
                          color: theme.palette.primary.main,
                          borderRadius: "4px",
                          px: "6px",
                          py: "2px",
                          "&:hover": localField.label ? { backgroundColor: theme.palette.background.fill } : {},
                        }}
                      >
                        {guidanceLoading ? (
                          <CircularProgress size={12} sx={{ color: theme.palette.primary.main }} />
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
                label="Required field"
                isChecked={localField.validation?.required || false}
                value="required"
                onChange={() =>
                  handleValidationChange("required", !localField.validation?.required)
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
              <Typography sx={{ color: theme.palette.text.accent, fontSize: "11px", mt: "4px" }}>
                No compatible entity fields for this field type
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default FieldEditor;
