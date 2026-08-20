import { useMemo, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import Field from "../Inputs/Field";
import Select from "../Inputs/Select";
import Checkbox from "../Inputs/Checkbox";
import { ExtensionConfigField, ExtensionFieldType } from "../../../domain/types/extensions";

/**
 * Generic renderer for `extension_config_fields` rows returned by the API.
 *
 * `initialValues` is the redacted `configuration` blob from the backend —
 * secret fields are absent by design. The form treats a blank secret input
 * as "keep the existing stored value"; only non-empty secrets are submitted.
 *
 * Uses the house Inputs/{Field,Select,Checkbox} components so the visual
 * language matches every other configuration surface in the app (labels above
 * the field, no floating MUI labels).
 */

export interface ExtensionConfigFormValues {
  [fieldKey: string]: unknown;
}

interface ExtensionConfigFormProps {
  fields: ExtensionConfigField[];
  initialValues: Record<string, unknown>;
  disabled?: boolean;
  onChange?: (values: ExtensionConfigFormValues) => void;
}

function coerceDefault(defaultValue: string | null, type: ExtensionFieldType): unknown {
  if (defaultValue === null || defaultValue === undefined) {
    return type === "boolean" ? false : type === "multiselect" ? [] : "";
  }
  switch (type) {
    case "boolean":
      return defaultValue === "true";
    case "number":
      return Number.isNaN(Number(defaultValue)) ? "" : Number(defaultValue);
    case "multiselect":
      return defaultValue ? defaultValue.split(",").map((s) => s.trim()) : [];
    default:
      return defaultValue;
  }
}

function initialValueFor(field: ExtensionConfigField, stored: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(stored, field.fieldKey)) {
    return stored[field.fieldKey];
  }
  return coerceDefault(field.defaultValue, field.fieldType);
}

export function ExtensionConfigForm({
  fields,
  initialValues,
  disabled,
  onChange,
}: ExtensionConfigFormProps) {
  const theme = useTheme();
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.displayOrder - b.displayOrder),
    [fields],
  );

  const [values, setValues] = useState<ExtensionConfigFormValues>(() => {
    const seed: ExtensionConfigFormValues = {};
    for (const field of sortedFields) {
      // Secrets: leave blank in the form so the user can either type a new
      // value or leave it empty to preserve whatever's stored on the server.
      seed[field.fieldKey] = field.isSecret ? "" : initialValueFor(field, initialValues);
    }
    return seed;
  });

  const update = (fieldKey: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [fieldKey]: value };
      onChange?.(next);
      return next;
    });
  };

  if (sortedFields.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mt: "8px" }}>
        This extension has no configuration.
      </Typography>
    );
  }

  return (
    <Stack spacing="20px" sx={{ mt: "12px" }}>
      {sortedFields.map((field) => (
        <FieldRow
          key={field.fieldKey}
          field={field}
          value={values[field.fieldKey]}
          onChange={(v) => update(field.fieldKey, v)}
          disabled={disabled}
        />
      ))}
    </Stack>
  );
}

interface FieldRowProps {
  field: ExtensionConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}

function FieldRow({ field, value, onChange, disabled }: FieldRowProps) {
  const theme = useTheme();
  const stringValue = typeof value === "string" ? value : "";
  const numberValue = value === "" || value === undefined || value === null ? "" : String(value);

  switch (field.fieldType) {
    case "boolean":
      return (
        <Box>
          <Checkbox
            id={`ext-field-${field.fieldKey}`}
            label={field.label}
            isChecked={value === true}
            value="true"
            onChange={() => onChange(!(value === true))}
            isDisabled={disabled}
          />
          {field.helpText && (
            <Typography
              sx={{ fontSize: 12, color: theme.palette.text.tertiary, mt: "4px", ml: "34px" }}
            >
              {field.helpText}
            </Typography>
          )}
        </Box>
      );

    case "select": {
      const items = (field.options ?? []).map((opt) => ({ _id: opt.value, name: opt.label }));
      return (
        <Box>
          <Select
            id={`ext-field-${field.fieldKey}`}
            label={field.label}
            value={stringValue}
            items={items}
            isRequired={field.isRequired}
            disabled={disabled}
            onChange={(e) => onChange(String(e.target.value))}
          />
          {field.helpText && (
            <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary, mt: "4px" }}>
              {field.helpText}
            </Typography>
          )}
        </Box>
      );
    }

    case "multiselect": {
      // House Select is single-value; fall back to a comma-joined text field
      // for multiselect until a house MultiSelect is wired here. Values still
      // ship as an array to the backend.
      const asString = Array.isArray(value) ? (value as string[]).join(", ") : "";
      const optionsHint = (field.options ?? []).map((o) => o.label).join(", ");
      return (
        <Box>
          <Field
            id={`ext-field-${field.fieldKey}`}
            label={field.label}
            placeholder={field.placeholder ?? optionsHint}
            value={asString}
            isRequired={field.isRequired}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            helperText={field.helpText ?? undefined}
          />
        </Box>
      );
    }

    case "textarea":
      return (
        <Field
          id={`ext-field-${field.fieldKey}`}
          label={field.label}
          placeholder={field.placeholder ?? undefined}
          value={stringValue}
          isRequired={field.isRequired}
          disabled={disabled}
          multiline
          minRows={3}
          onChange={(e) => onChange(e.target.value)}
          helperText={field.helpText ?? undefined}
        />
      );

    case "number":
      return (
        <Field
          id={`ext-field-${field.fieldKey}`}
          type="number"
          label={field.label}
          placeholder={field.placeholder ?? undefined}
          value={numberValue}
          isRequired={field.isRequired}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? "" : Number(raw));
          }}
          helperText={field.helpText ?? undefined}
        />
      );

    case "password":
      return (
        <Field
          id={`ext-field-${field.fieldKey}`}
          type="password"
          label={field.label}
          placeholder={
            field.placeholder ??
            (field.isSecret ? "Leave blank to keep the existing value" : undefined)
          }
          value={stringValue}
          isRequired={field.isRequired}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          helperText={field.helpText ?? undefined}
        />
      );

    case "email":
    case "url":
    case "text":
    default:
      return (
        <Field
          id={`ext-field-${field.fieldKey}`}
          type={field.fieldType === "email" ? "email" : field.fieldType === "url" ? "url" : "text"}
          label={field.label}
          placeholder={field.placeholder ?? undefined}
          value={stringValue}
          isRequired={field.isRequired}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          helperText={field.helpText ?? undefined}
        />
      );
  }
}

/**
 * Prepare form values for submission — drop keys with empty strings for
 * `is_secret` fields so the "leave blank = keep existing" contract is
 * honoured. Also drops empty-string values for non-secret optional fields
 * so they store as absent rather than `""`.
 */
export function prepareSubmitValues(
  fields: ExtensionConfigField[],
  values: ExtensionConfigFormValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const v = values[field.fieldKey];
    if (field.isSecret) {
      if (typeof v === "string" && v.length > 0) out[field.fieldKey] = v;
      continue;
    }
    if (v === "" || v === undefined || v === null) continue;
    out[field.fieldKey] = v;
  }
  return out;
}

export function OptionalNotice() {
  return (
    <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>
      Password/token fields are stored encrypted. Leave blank to keep the existing value.
    </Typography>
  );
}
