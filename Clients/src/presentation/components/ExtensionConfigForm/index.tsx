import { useMemo, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import Field from "../Inputs/Field";
import { CustomizableButton } from "../button/customizable-button";
import Select from "../Inputs/Select";
import Checkbox from "../Inputs/Checkbox";
import { ExtensionConfigField, ExtensionFieldType } from "../../../domain/types/extensions";

/**
 * Generic renderer for `extension_config_fields` rows returned by the API.
 *
 * `initialValues` is the redacted `configuration` blob from the backend —
 * secret fields are absent by design; `secretsSet` names the secret fields
 * that hold a stored value. A secret's form value is a string (blank keeps
 * the stored value, typed text replaces it) or `null` once the user clears
 * it with the Clear action. See `prepareSubmitValues` for what is sent.
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
  /** Secret field keys with a stored value (`Extension.secretsSet`). */
  secretsSet?: string[];
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

/**
 * The values the form starts with: the stored value (or the field default)
 * for every non-secret field, and a blank string for every secret so a
 * stored secret is kept unless the user types a new one or clears it.
 * The settings page seeds its own copy with this so an untouched form still
 * sends the stored values.
 */
export function initialFormValues(
  fields: ExtensionConfigField[],
  stored: Record<string, unknown>,
): ExtensionConfigFormValues {
  const seed: ExtensionConfigFormValues = {};
  for (const field of fields) {
    seed[field.fieldKey] = field.isSecret ? "" : initialValueFor(field, stored);
  }
  return seed;
}

export function ExtensionConfigForm({
  fields,
  initialValues,
  secretsSet = [],
  disabled,
  onChange,
}: ExtensionConfigFormProps) {
  const theme = useTheme();
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.displayOrder - b.displayOrder),
    [fields],
  );

  const [values, setValues] = useState<ExtensionConfigFormValues>(() =>
    initialFormValues(sortedFields, initialValues),
  );

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
          isStored={field.isSecret && secretsSet.includes(field.fieldKey)}
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
  /** Secret fields only: the server holds a value for this field. */
  isStored?: boolean;
}

function FieldRow({ field, value, onChange, disabled, isStored }: FieldRowProps) {
  const theme = useTheme();
  if (field.isSecret) {
    return (
      <SecretFieldRow
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        isStored={isStored === true}
      />
    );
  }
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
          placeholder={field.placeholder ?? undefined}
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

interface SecretFieldRowProps {
  field: ExtensionConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  isStored: boolean;
}

/**
 * A secret input. When the server holds a value the field says so and offers
 * Clear, which marks the value for removal (`null`) until the next save;
 * Undo goes back to keeping it. Nothing stored: a plain password input.
 */
function SecretFieldRow({ field, value, onChange, disabled, isStored }: SecretFieldRowProps) {
  const theme = useTheme();
  const isCleared = value === null;
  const stringValue = typeof value === "string" ? value : "";
  const placeholder =
    isStored && !isCleared ? "Stored. Leave blank to keep it." : (field.placeholder ?? undefined);

  return (
    <Box>
      <Field
        id={`ext-field-${field.fieldKey}`}
        type="password"
        label={field.label}
        placeholder={placeholder}
        value={stringValue}
        isRequired={field.isRequired}
        disabled={disabled || isCleared}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        helperText={field.helpText ?? undefined}
      />
      {isStored && (
        <Stack direction="row" alignItems="center" spacing="8px" sx={{ mt: "4px" }}>
          {isCleared && (
            <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary }}>
              Will be removed when you save.
            </Typography>
          )}
          <CustomizableButton
            variant="text"
            color="primary"
            size="small"
            isDisabled={disabled}
            onClick={() => onChange(isCleared ? "" : null)}
            testId={`ext-field-${field.fieldKey}-${isCleared ? "undo" : "clear"}`}
            sx={{ px: "4px", minWidth: 0 }}
          >
            {isCleared ? "Undo" : "Clear"}
          </CustomizableButton>
        </Stack>
      )}
    </Box>
  );
}

/**
 * Prepare form values for submission. The server keeps the stored value of
 * any field left out of the payload and clears a field sent as `null`, so:
 * - secret: typed text is sent; `null` (cleared with the Clear action) is
 *   sent as `null`; blank (untouched) is left out so the stored value stays.
 * - non-secret: an emptied value ("" or an empty list) is sent as `null` so
 *   the stored value is cleared; anything else is sent as is.
 */
export function prepareSubmitValues(
  fields: ExtensionConfigField[],
  values: ExtensionConfigFormValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field.fieldKey)) continue;
    const v = values[field.fieldKey];
    if (field.isSecret) {
      if (v === null) out[field.fieldKey] = null;
      else if (typeof v === "string" && v.length > 0) out[field.fieldKey] = v;
      continue;
    }
    if (v === undefined) continue;
    const isEmpty = v === "" || v === null || (Array.isArray(v) && v.length === 0);
    out[field.fieldKey] = isEmpty ? null : v;
  }
  return out;
}

export function OptionalNotice() {
  return (
    <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>
      Password and token fields are stored encrypted.
    </Typography>
  );
}
