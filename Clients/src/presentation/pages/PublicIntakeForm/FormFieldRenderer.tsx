import { Box, Typography } from "@mui/material";
import { Controller, Control, FieldErrors } from "react-hook-form";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import { FormField } from "../IntakeFormBuilder/types";

/**
 * Renders a field label
 */
function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Box sx={{ mb: "6px" }}>
      <Typography sx={{ fontSize: "14px", color: "#334155", fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
      </Typography>
    </Box>
  );
}

/**
 * Safely create a RegExp from a pattern string, returning null if invalid or too long
 */
function safeRegExp(pattern: string): RegExp | null {
  if (pattern.length > 500) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Guidance text displayed directly under the input element
 */
function GuidanceText({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <Typography
      sx={{
        fontSize: "12px",
        color: "#94a3b8",
        mt: "4px",
        lineHeight: 1.4,
      }}
    >
      {text}
    </Typography>
  );
}

/**
 * Helper text displayed below fields
 */
function HelperText({ text, isError }: { text?: string; isError?: boolean }) {
  if (!text) return null;
  return (
    <Typography
      sx={{
        fontSize: "12px",
        color: isError ? "#ef4444" : "#94a3b8",
        mt: "4px",
        lineHeight: 1.4,
      }}
    >
      {text}
    </Typography>
  );
}

/**
 * Props for FormFieldRenderer
 */
interface FormFieldRendererProps {
  field: FormField;
  control: Control<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

/**
 * Renders a single form field based on its type
 */
export function FormFieldRenderer({ field, control, errors }: FormFieldRendererProps) {
  const error = errors[field.id];
  const errorMessage = error?.message as string | undefined;
  const isRequired = field.validation?.required;

  const renderField = () => {
    switch (field.type) {
      case "text":
      case "email":
      case "url":
        return (
          <>
            <FieldLabel label={field.label} required={isRequired} />
            <Controller
              name={field.id}
              control={control}
              defaultValue={field.defaultValue || ""}
              rules={{
                required: isRequired ? "This field is required" : false,
                minLength: field.validation?.minLength
                  ? {
                      value: field.validation.minLength,
                      message: `Minimum ${field.validation.minLength} characters`,
                    }
                  : undefined,
                maxLength: field.validation?.maxLength
                  ? {
                      value: field.validation.maxLength,
                      message: `Maximum ${field.validation.maxLength} characters`,
                    }
                  : undefined,
                pattern: (() => {
                  const regex = field.validation?.pattern
                    ? safeRegExp(field.validation.pattern)
                    : null;
                  return regex
                    ? {
                        value: regex,
                        message: field.validation?.patternMessage || "Invalid format",
                      }
                    : undefined;
                })(),
              }}
              render={({ field: fieldProps }) => (
                <>
                  <Field
                    id={`field-${field.id}`}
                    label=""
                    {...fieldProps}
                    value={fieldProps.value as string}
                    placeholder={field.placeholder}
                    type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
                    error={errorMessage}
                    helperText={errorMessage || field.helpText}
                  />
                  <GuidanceText text={field.guidanceText} />
                </>
              )}
            />
          </>
        );

      case "textarea":
        return (
          <>
            <FieldLabel label={field.label} required={isRequired} />
            <Controller
              name={field.id}
              control={control}
              defaultValue={field.defaultValue || ""}
              rules={{
                required: isRequired ? "This field is required" : false,
                minLength: field.validation?.minLength
                  ? {
                      value: field.validation.minLength,
                      message: `Minimum ${field.validation.minLength} characters`,
                    }
                  : undefined,
                maxLength: field.validation?.maxLength
                  ? {
                      value: field.validation.maxLength,
                      message: `Maximum ${field.validation.maxLength} characters`,
                    }
                  : undefined,
              }}
              render={({ field: fieldProps }) => (
                <>
                  <Field
                    id={`field-${field.id}`}
                    label=""
                    {...fieldProps}
                    value={fieldProps.value as string}
                    placeholder={field.placeholder}
                    rows={4}
                    error={errorMessage}
                    helperText={errorMessage || field.helpText}
                  />
                  <GuidanceText text={field.guidanceText} />
                </>
              )}
            />
          </>
        );

      case "number":
        return (
          <>
            <FieldLabel label={field.label} required={isRequired} />
            <Controller
              name={field.id}
              control={control}
              defaultValue={field.defaultValue || ""}
              rules={{
                required: isRequired ? "This field is required" : false,
                min:
                  field.validation?.min !== undefined
                    ? {
                        value: field.validation.min,
                        message: `Minimum value is ${field.validation.min}`,
                      }
                    : undefined,
                max:
                  field.validation?.max !== undefined
                    ? {
                        value: field.validation.max,
                        message: `Maximum value is ${field.validation.max}`,
                      }
                    : undefined,
              }}
              render={({ field: fieldProps }) => (
                <>
                  <Field
                    id={`field-${field.id}`}
                    label=""
                    {...fieldProps}
                    value={fieldProps.value as string | number}
                    type="number"
                    placeholder={field.placeholder}
                    error={errorMessage}
                    helperText={errorMessage || field.helpText}
                  />
                  <GuidanceText text={field.guidanceText} />
                </>
              )}
            />
          </>
        );

      case "date":
        return (
          <>
            <FieldLabel label={field.label} required={isRequired} />
            <Controller
              name={field.id}
              control={control}
              defaultValue={field.defaultValue || ""}
              rules={{
                required: isRequired ? "This field is required" : false,
              }}
              render={({ field: fieldProps }) => (
                <>
                  <Field
                    id={`field-${field.id}`}
                    label=""
                    {...fieldProps}
                    value={fieldProps.value as string}
                    type="date"
                    error={errorMessage}
                    helperText={errorMessage || field.helpText}
                  />
                  <GuidanceText text={field.guidanceText} />
                </>
              )}
            />
          </>
        );

      case "select":
        return (
          <>
            <FieldLabel label={field.label} required={isRequired} />
            <Controller
              name={field.id}
              control={control}
              defaultValue={field.defaultValue || ""}
              rules={{
                required: isRequired ? "This field is required" : false,
              }}
              render={({ field: fieldProps }) => (
                <Box>
                  <Select
                    id={`field-${field.id}`}
                    label=""
                    placeholder="Select an option"
                    value={fieldProps.value as string}
                    onChange={(e) => fieldProps.onChange(e.target.value)}
                    items={(field.options || []).map((opt) => ({
                      _id: opt.value,
                      name: opt.label,
                    }))}
                    error={errorMessage}
                    sx={{
                      width: "100%",
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "8px",
                        fontSize: "15px",
                      },
                    }}
                  />
                  <GuidanceText text={field.guidanceText} />
                  <HelperText text={!errorMessage ? field.helpText : undefined} />
                </Box>
              )}
            />
          </>
        );

      case "multiselect":
        return (
          <>
            <FieldLabel label={field.label} required={isRequired} />
            <Controller
              name={field.id}
              control={control}
              defaultValue={field.defaultValue || []}
              rules={{
                required: isRequired ? "This field is required" : false,
              }}
              render={({ field: fieldProps }) => {
                const selectedArr = (fieldProps.value as string[]) || [];
                return (
                  <Box>
                    {/* Selected chips */}
                    {selectedArr.length > 0 && (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px", mb: "8px" }}>
                        {selectedArr.map((val) => {
                          const option = field.options?.find((o) => o.value === val);
                          return (
                            <Box
                              key={val}
                              sx={{
                                height: 24,
                                px: "10px",
                                display: "inline-flex",
                                alignItems: "center",
                                fontSize: "12px",
                                backgroundColor: "#f0fdf4",
                                color: "#334155",
                                border: "1px solid #e2e8f0",
                                borderRadius: "12px",
                                gap: "4px",
                              }}
                            >
                              {option?.label || val}
                              <span
                                onClick={() => {
                                  fieldProps.onChange(selectedArr.filter((v) => v !== val));
                                }}
                                style={{ cursor: "pointer", color: "#94a3b8", marginLeft: "2px" }}
                              >
                                ×
                              </span>
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                    {/* Options list */}
                    <Box
                      sx={{
                        border: error ? "1px solid #ef4444" : "1px solid #e2e8f0",
                        borderRadius: "8px",
                        maxHeight: 200,
                        overflowY: "auto",
                      }}
                    >
                      {(field.options || []).map((option) => {
                        const isChecked = selectedArr.includes(option.value);
                        return (
                          <Box
                            key={option.value}
                            onClick={() => {
                              if (isChecked) {
                                fieldProps.onChange(selectedArr.filter((v) => v !== option.value));
                              } else {
                                fieldProps.onChange([...selectedArr, option.value]);
                              }
                            }}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              px: "12px",
                              py: "8px",
                              cursor: "pointer",
                              backgroundColor: isChecked ? "#f0fdf4" : "transparent",
                              "&:hover": {
                                backgroundColor: isChecked ? "#dcfce7" : "#f8fafc",
                              },
                              borderBottom: "1px solid #f1f5f9",
                              "&:last-child": { borderBottom: "none" },
                            }}
                          >
                            <Checkbox
                              id={`field-${field.id}-${option.value}`}
                              isChecked={isChecked}
                              value={option.value}
                              onChange={() => {}}
                              size="small"
                            />
                            <Typography sx={{ fontSize: "14px", color: "#334155" }}>
                              {option.label}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                    <GuidanceText text={field.guidanceText} />
                    <HelperText text={errorMessage || field.helpText} isError={!!error} />
                  </Box>
                );
              }}
            />
          </>
        );

      case "checkbox":
        return (
          <Controller
            name={field.id}
            control={control}
            defaultValue={field.defaultValue || false}
            rules={{
              required: isRequired ? "This field is required" : false,
            }}
            render={({ field: fieldProps }) => (
              <Box>
                <Checkbox
                  id={`field-${field.id}`}
                  isChecked={!!fieldProps.value}
                  value={field.id}
                  onChange={(e) => fieldProps.onChange((e.target as HTMLInputElement).checked)}
                  label={isRequired ? `${field.label} *` : field.label}
                />
                <GuidanceText text={field.guidanceText} />
                <HelperText text={errorMessage || field.helpText} isError={!!error} />
              </Box>
            )}
          />
        );

      default:
        return null;
    }
  };

  return <Box>{renderField()}</Box>;
}

export default FormFieldRenderer;
