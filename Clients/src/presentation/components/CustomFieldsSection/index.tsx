import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type {
  CustomFieldEntityType,
  ICustomFieldDefinition,
} from "../../../domain/interfaces/i.customField";
import {
  customFieldsKeys,
  useCustomFieldDefinitions,
  useCustomFieldValues,
} from "../../../application/hooks/useCustomFields";
import {
  deleteCustomFieldValue as deleteCustomFieldValueAPI,
  setCustomFieldValue as setCustomFieldValueAPI,
} from "../../../application/repository/customField.repository";
import useUsers from "../../../application/hooks/useUsers";
import dayjs, { Dayjs } from "dayjs";
import DatePicker from "../Inputs/Datepicker";
import Field from "../Inputs/Field";
import Select from "../Inputs/Select";
import Toggle from "../Inputs/Toggle";
import AutoCompleteField from "../Inputs/Autocomplete";
import { RequiredCustomFieldsBanner } from "./RequiredCustomFieldsGate";

export interface CustomFieldsSectionHandle {
  /**
   * Persist locally-staged changes (upserts and clears) against the given
   * entityId. Call from the parent form's main Save handler, AFTER the entity
   * row has been created or updated. Throws on failure; the section renders
   * an inline warning when that happens.
   */
  flush: (entityId: number) => Promise<void>;
  hasPendingValues: () => boolean;
}

interface CustomFieldsSectionProps {
  entityType: CustomFieldEntityType;
  entityId: number | null;
}

const CustomFieldsSection = forwardRef<CustomFieldsSectionHandle, CustomFieldsSectionProps>(
  ({ entityType, entityId }, ref) => {
    const theme = useTheme();
    const queryClient = useQueryClient();
    const isCreateMode = entityId === null || entityId <= 0;

    const {
      data: definitions,
      isLoading: defsLoading,
      isError: defsError,
    } = useCustomFieldDefinitions(entityType);
    const { data: values, isLoading: valuesLoading } = useCustomFieldValues(entityType, entityId);

    // Pending changes: values the user has set/changed, plus defs the user
    // wants cleared. Both apply in create AND edit mode — the parent's main
    // Save commits everything in one flush().
    const [stagedValues, setStagedValues] = useState<Map<number, unknown>>(() => new Map());
    const [clearedDefs, setClearedDefs] = useState<Set<number>>(() => new Set());
    // Set when the most recent flush() call failed.
    const [flushError, setFlushError] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        flush: async (id: number) => {
          if (stagedValues.size === 0 && clearedDefs.size === 0) return;
          setFlushError(null);
          try {
            await Promise.all([
              ...Array.from(stagedValues.entries()).map(([definitionId, value]) =>
                setCustomFieldValueAPI({
                  definition_id: definitionId,
                  entity_id: id,
                  value,
                }),
              ),
              ...Array.from(clearedDefs).map((definitionId) =>
                deleteCustomFieldValueAPI({
                  definitionId,
                  entityId: id,
                }),
              ),
            ]);
            setStagedValues(new Map());
            setClearedDefs(new Set());
            queryClient.invalidateQueries({
              queryKey: customFieldsKeys.values(entityType, id),
            });
            queryClient.invalidateQueries({
              queryKey: customFieldsKeys.missingRequired(entityType, id),
            });
          } catch (err) {
            setFlushError(extractErrorMessage(err));
            throw err;
          }
        },
        hasPendingValues: () => stagedValues.size > 0 || clearedDefs.size > 0,
      }),
      [stagedValues, clearedDefs, queryClient, entityType],
    );

    const stageValue = (definitionId: number, value: unknown) => {
      setStagedValues((prev) => {
        const next = new Map(prev);
        next.set(definitionId, value);
        return next;
      });
      setClearedDefs((prev) => {
        if (!prev.has(definitionId)) return prev;
        const next = new Set(prev);
        next.delete(definitionId);
        return next;
      });
    };

    const clearValue = (definitionId: number) => {
      setClearedDefs((prev) => {
        const next = new Set(prev);
        next.add(definitionId);
        return next;
      });
      setStagedValues((prev) => {
        if (!prev.has(definitionId)) return prev;
        const next = new Map(prev);
        next.delete(definitionId);
        return next;
      });
    };

    const resetValue = (definitionId: number) => {
      setStagedValues((prev) => {
        if (!prev.has(definitionId)) return prev;
        const next = new Map(prev);
        next.delete(definitionId);
        return next;
      });
      setClearedDefs((prev) => {
        if (!prev.has(definitionId)) return prev;
        const next = new Set(prev);
        next.delete(definitionId);
        return next;
      });
    };

    if (defsLoading || (!isCreateMode && valuesLoading)) {
      return (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: theme.spacing(4),
            px: theme.spacing(2),
          }}
        >
          <CircularProgress size={20} />
        </Box>
      );
    }

    if (defsError) {
      return (
        <Box sx={{ py: theme.spacing(4), px: theme.spacing(2) }}>
          <Typography sx={{ fontSize: 13, color: theme.palette.error.main }}>
            Failed to load custom fields.
          </Typography>
        </Box>
      );
    }

    if (!definitions || definitions.length === 0) {
      return (
        <Box sx={{ py: theme.spacing(4), px: theme.spacing(2) }}>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            No custom fields defined for this entity. An admin can add them in Settings &rsaquo;
            Custom fields.
          </Typography>
        </Box>
      );
    }

    const storedValueMap = new Map<number, unknown>();
    (values ?? []).forEach((v) => storedValueMap.set(v.definition_id, v.value));

    return (
      <Stack spacing={6} sx={{ py: theme.spacing(4), px: theme.spacing(2) }}>
        {flushError && (
          <Alert severity="warning" onClose={() => setFlushError(null)} sx={{ fontSize: 13 }}>
            Custom field values could not be saved: {flushError}.
          </Alert>
        )}
        {!isCreateMode && (
          <RequiredCustomFieldsBanner entityType={entityType} entityId={entityId as number} />
        )}
        {definitions.map((def) => (
          <CustomFieldRow
            key={def.id}
            definition={def}
            storedValue={storedValueMap.get(def.id)}
            onStage={stageValue}
            onClear={clearValue}
            onReset={resetValue}
          />
        ))}
      </Stack>
    );
  },
);

CustomFieldsSection.displayName = "CustomFieldsSection";

interface CustomFieldRowProps {
  definition: ICustomFieldDefinition;
  storedValue: unknown;
  onStage: (definitionId: number, value: unknown) => void;
  onClear: (definitionId: number) => void;
  onReset: (definitionId: number) => void;
}

function normalize(value: unknown, type: ICustomFieldDefinition["field_type"]): unknown {
  if (value === undefined) {
    return type === "multiselect" ? [] : type === "boolean" ? false : null;
  }
  if (type === "multiselect" && !Array.isArray(value)) {
    return [];
  }
  if (type === "boolean" && typeof value !== "boolean") {
    return false;
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown, type: ICustomFieldDefinition["field_type"]): boolean {
  if (type === "multiselect") {
    const av = Array.isArray(a) ? [...(a as string[])].sort() : [];
    const bv = Array.isArray(b) ? [...(b as string[])].sort() : [];
    if (av.length !== bv.length) return false;
    return av.every((v, i) => v === bv[i]);
  }
  return a === b;
}

function isEmpty(value: unknown, type: ICustomFieldDefinition["field_type"]): boolean {
  if (value === null || value === undefined) return true;
  if (type === "multiselect") return !Array.isArray(value) || value.length === 0;
  if (type === "text") return typeof value === "string" && value.trim() === "";
  return false;
}

const CustomFieldRow: React.FC<CustomFieldRowProps> = ({
  definition,
  storedValue,
  onStage,
  onClear,
  onReset,
}) => {
  const theme = useTheme();

  const stored = normalize(storedValue, definition.field_type);
  const [draft, setDraft] = useState<unknown>(stored);

  // Reset the draft when the stored value changes (e.g. after a successful
  // flush invalidates the cache and refetches).
  useEffect(() => {
    setDraft(normalize(storedValue, definition.field_type));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedValue, definition.id, definition.field_type]);

  const storedHasValue = !isEmpty(stored, definition.field_type);

  // Reconcile draft → parent maps whenever the draft changes.
  useEffect(() => {
    const draftIsEmpty = isEmpty(draft, definition.field_type);
    const dirty = !valuesEqual(draft, stored, definition.field_type);

    if (!dirty) {
      onReset(definition.id);
      return;
    }
    if (draftIsEmpty && storedHasValue) {
      // User cleared a stored value — mark for delete on flush.
      onClear(definition.id);
      return;
    }
    if (draftIsEmpty) {
      // Dirty + empty + nothing stored — nothing to do.
      onReset(definition.id);
      return;
    }
    onStage(definition.id, draft);
    // We exclude onStage/onClear/onReset/stored from deps so callback identity
    // churn does not re-fire the effect. `stored` / `storedHasValue` only
    // change when the parent reload happens, at which point the draft-reset
    // effect above sets `draft`, which retriggers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, definition.id, definition.field_type]);

  const handleClear = () => {
    setDraft(normalize(undefined, definition.field_type));
  };

  const draftIsEmpty = isEmpty(draft, definition.field_type);
  const showClear = !draftIsEmpty;

  return (
    <Stack gap={theme.spacing(2)}>
      <Typography
        component="p"
        variant="body1"
        color={theme.palette.text.secondary}
        fontWeight={500}
        fontSize={"13px"}
        sx={{ margin: 0, height: "22px" }}
      >
        {definition.label}
        {definition.required && (
          <Typography component="span" ml={theme.spacing(1)} color={theme.palette.error.text}>
            *
          </Typography>
        )}
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {renderInput({ definition, draft, setDraft, disabled: false })}
        </Box>

        {showClear && (
          <IconButton
            size="small"
            disableRipple
            onClick={handleClear}
            title="Clear value"
            sx={{ color: theme.palette.text.tertiary }}
          >
            <Trash2 size={16} />
          </IconButton>
        )}
      </Stack>
    </Stack>
  );
};

interface InputProps {
  definition: ICustomFieldDefinition;
  draft: unknown;
  setDraft: (v: unknown) => void;
  disabled: boolean;
}

function renderInput(props: InputProps): React.ReactNode {
  switch (props.definition.field_type) {
    case "text":
      return <TextInput {...props} />;
    case "number":
      return <NumberInput {...props} />;
    case "date":
      return <DateInput {...props} />;
    case "boolean":
      return <BooleanInput {...props} />;
    case "select":
      return <SelectInput {...props} />;
    case "multiselect":
      return <MultiSelectInput {...props} />;
    case "user":
      return <UserInput {...props} />;
    default:
      return null;
  }
}

const TextInput: React.FC<InputProps> = ({ definition, draft, setDraft, disabled }) => (
  <Field
    id={`cf-${definition.id}`}
    value={typeof draft === "string" ? draft : ""}
    placeholder={`Enter ${definition.label.toLowerCase()}`}
    disabled={disabled}
    onChange={(e) => setDraft(e.target.value)}
  />
);

const NumberInput: React.FC<InputProps> = ({ definition, draft, setDraft, disabled }) => (
  <Field
    id={`cf-${definition.id}`}
    type="number"
    value={draft === null || draft === undefined ? "" : String(draft)}
    placeholder={`Enter ${definition.label.toLowerCase()}`}
    disabled={disabled}
    onChange={(e) => {
      const raw = e.target.value;
      if (raw === "") {
        setDraft(null);
        return;
      }
      const n = Number(raw);
      setDraft(Number.isFinite(n) ? n : null);
    }}
  />
);

const DateInput: React.FC<InputProps> = ({ draft, setDraft, disabled }) => {
  const value = typeof draft === "string" && draft ? dayjs(draft.slice(0, 10)) : null;
  return (
    <DatePicker
      date={value as Dayjs | null}
      disabled={disabled}
      handleDateChange={(next) => {
        if (!next || !next.isValid()) {
          setDraft(null);
          return;
        }
        setDraft(next.format("YYYY-MM-DD"));
      }}
      sx={{ width: "100%" }}
    />
  );
};

const BooleanInput: React.FC<InputProps> = ({ draft, setDraft, disabled }) => (
  <Toggle
    checked={draft === true}
    disabled={disabled}
    onChange={(_e, checked) => setDraft(checked)}
  />
);

const SelectInput: React.FC<InputProps> = ({ definition, draft, setDraft, disabled }) => {
  const items = (definition.options ?? []).map((opt) => ({
    _id: opt,
    name: opt,
  }));
  return (
    <Select
      id={`cf-${definition.id}`}
      value={typeof draft === "string" ? draft : ""}
      items={items}
      onChange={(e) => setDraft((e.target.value as string) || null)}
      disabled={disabled}
      placeholder="Select an option"
    />
  );
};

const MultiSelectInput: React.FC<InputProps> = ({ definition, draft, setDraft, disabled }) => {
  const selected = Array.isArray(draft) ? (draft as string[]) : [];
  const options = definition.options ?? [];
  return (
    <AutoCompleteField<string, true>
      multiple
      disableCloseOnSelect
      disabled={disabled}
      options={options}
      value={selected}
      onChange={(_e, next) => setDraft(next as string[])}
      placeholder={selected.length === 0 ? "Select options" : ""}
      isOptionEqualToValue={(a, b) => a === b}
    />
  );
};

const UserInput: React.FC<InputProps> = ({ definition, draft, setDraft, disabled }) => {
  const { users, loading } = useUsers();
  const items = users.map((u) => ({
    _id: u.id,
    name: u.name ?? "",
    surname: u.surname ?? undefined,
    email: u.email ?? undefined,
  }));
  return (
    <Select
      id={`cf-${definition.id}`}
      value={typeof draft === "number" ? draft : ""}
      items={items}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || v === null || v === undefined) {
          setDraft(null);
          return;
        }
        const n = typeof v === "number" ? v : Number(v);
        setDraft(Number.isFinite(n) ? n : null);
      }}
      disabled={disabled || loading}
      placeholder={loading ? "Loading…" : "Select a user"}
    />
  );
};

function extractErrorMessage(err: any): string {
  return (
    err?.response?.data?.error || err?.response?.data?.message || err?.message || "Failed to save"
  );
}

export default CustomFieldsSection;
