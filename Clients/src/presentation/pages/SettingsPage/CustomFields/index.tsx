import React, { useMemo, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Info, Plus as PlusIcon, Trash2, Pencil } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { CustomizableButton } from "../../../components/button/customizable-button";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import { useAuth } from "../../../../application/hooks/useAuth";
import {
  CUSTOM_FIELD_ENTITY_LABELS,
  CUSTOM_FIELD_TYPE_LABELS,
  CustomFieldEntityType,
  CustomFieldType,
  ICustomFieldDefinition,
} from "../../../../domain/interfaces/i.customField";
import {
  useCreateCustomFieldDefinition,
  useCustomFieldDefinitions,
  useDeleteCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
} from "../../../../application/hooks/useCustomFields";

const TABLE_COLUMNS = [
  { id: "label", label: "LABEL" },
  { id: "field_key", label: "KEY" },
  { id: "field_type", label: "TYPE" },
  { id: "required", label: "REQUIRED" },
  { id: "options", label: "OPTIONS" },
  { id: "actions", label: "" },
];

const ENTITY_ITEMS = Object.entries(CUSTOM_FIELD_ENTITY_LABELS).map(([value, label]) => ({
  _id: value,
  name: label,
}));

const FIELD_TYPE_ITEMS = Object.entries(CUSTOM_FIELD_TYPE_LABELS).map(([value, label]) => ({
  _id: value,
  name: label,
}));

const CustomFieldsTab: React.FC = () => {
  const theme = useTheme();
  const { userRoleName } = useAuth();
  const isAdmin = userRoleName === "Admin";

  const [entityType, setEntityType] = useState<CustomFieldEntityType>("vendor");
  const [editing, setEditing] = useState<ICustomFieldDefinition | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ICustomFieldDefinition | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: definitions, isLoading, isError } = useCustomFieldDefinitions(entityType);
  const createMutation = useCreateCustomFieldDefinition();
  const updateMutation = useUpdateCustomFieldDefinition(entityType);
  const deleteMutation = useDeleteCustomFieldDefinition(entityType);

  if (!isAdmin) {
    return (
      <Stack sx={{ mt: 3, width: "100%" }}>
        <Stack sx={{ pt: theme.spacing(20) }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Only Admins can manage custom fields.
          </Typography>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack sx={{ mt: 3, width: "100%" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.black" }}>
            Custom fields
          </Typography>
          <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5 }}>
            Define additional fields that appear on records across your organization. Choose an
            entity and add fields. Field keys are permanent once created.
          </Typography>
        </Box>
        <CustomizableButton
          variant="contained"
          text="Add field"
          icon={<PlusIcon size={16} />}
          onClick={() => {
            setServerError(null);
            setCreating(true);
          }}
          sx={{
            backgroundColor: "brand.primary",
            border: "1px solid brand.primary",
            gap: 2,
          }}
        />
      </Box>

      <Stack sx={{ mb: 3, maxWidth: theme.spacing(120) }}>
        <Select
          id="custom-field-entity"
          label="Entity"
          value={entityType}
          items={ENTITY_ITEMS}
          onChange={(e) => setEntityType(e.target.value as CustomFieldEntityType)}
          placeholder="Select entity"
        />
      </Stack>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={20} />
        </Box>
      ) : isError ? (
        <Typography sx={{ fontSize: 13, color: theme.palette.error.main }}>
          Failed to load custom fields.
        </Typography>
      ) : !definitions || definitions.length === 0 ? (
        <Box
          sx={{
            p: 6,
            border: `1px dashed ${theme.palette.border.light}`,
            borderRadius: theme.shape.borderRadius,
            textAlign: "center",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            No custom fields for {CUSTOM_FIELD_ENTITY_LABELS[entityType].toLowerCase()} yet.
          </Typography>
        </Box>
      ) : (
        <TableContainer sx={{ overflowX: "auto", mt: 1 }}>
          <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
            <TableHead
              sx={{
                backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
              }}
            >
              <TableRow>
                {TABLE_COLUMNS.map((column) => (
                  <TableCell
                    key={column.id}
                    sx={singleTheme.tableStyles.primary.header.cell}
                    align={column.id === "actions" ? "right" : "left"}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "13px" }}>
                      {column.label}
                    </Typography>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {definitions.map((def) => (
                <TableRow key={def.id} sx={singleTheme.tableStyles.primary.body.row}>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{def.label}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography
                      component="code"
                      sx={{
                        fontSize: "12px",
                        fontFamily: "monospace",
                        color: "text.secondary",
                      }}
                    >
                      {def.field_key}
                    </Typography>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {CUSTOM_FIELD_TYPE_LABELS[def.field_type]}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {def.required ? "Yes" : "No"}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {(def.options ?? []).map((o) => (
                        <Chip
                          key={o}
                          label={o}
                          sx={{
                            fontSize: "11px",
                            height: "20px",
                            borderRadius: "4px",
                          }}
                        />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell} align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <IconButton
                        size="small"
                        disableRipple
                        onClick={() => {
                          setServerError(null);
                          setEditing(def);
                        }}
                        title="Edit field"
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton
                        size="small"
                        disableRipple
                        onClick={() => setConfirmDelete(def)}
                        title="Delete field"
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {creating && (
        <DefinitionFormModal
          mode="create"
          entityType={entityType}
          serverError={serverError}
          isSubmitting={createMutation.isPending}
          onClose={() => {
            setCreating(false);
            setServerError(null);
          }}
          onSubmit={(input) => {
            setServerError(null);
            createMutation.mutate(
              { ...input, entity_type: entityType },
              {
                onSuccess: () => setCreating(false),
                onError: (err: any) => setServerError(extractErrorMessage(err)),
              },
            );
          }}
        />
      )}

      {editing && (
        <DefinitionFormModal
          mode="edit"
          entityType={entityType}
          existing={editing}
          serverError={serverError}
          isSubmitting={updateMutation.isPending}
          onClose={() => {
            setEditing(null);
            setServerError(null);
          }}
          onSubmit={(input) => {
            setServerError(null);
            updateMutation.mutate(
              {
                id: editing.id,
                body: {
                  label: input.label,
                  required: input.required,
                  options: input.options ?? null,
                },
              },
              {
                onSuccess: () => setEditing(null),
                onError: (err: any) => setServerError(extractErrorMessage(err)),
              },
            );
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmationModal
          isOpen={true}
          title="Delete custom field"
          body={
            <Typography fontSize={13}>
              This will permanently remove "{confirmDelete.label}" and all values stored on existing
              records. This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          isLoading={deleteMutation.isPending}
          onCancel={() => setConfirmDelete(null)}
          onProceed={() => {
            deleteMutation.mutate(confirmDelete.id, {
              onSuccess: () => setConfirmDelete(null),
            });
          }}
        />
      )}
    </Stack>
  );
};

interface DefinitionFormModalProps {
  mode: "create" | "edit";
  entityType: CustomFieldEntityType;
  existing?: ICustomFieldDefinition;
  serverError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    field_key: string;
    label: string;
    field_type: CustomFieldType;
    options?: string[] | null;
    required?: boolean;
  }) => void;
}

const DefinitionFormModal: React.FC<DefinitionFormModalProps> = ({
  mode,
  entityType,
  existing,
  serverError,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [fieldKey, setFieldKey] = useState(existing?.field_key ?? "");
  const [fieldType, setFieldType] = useState<CustomFieldType>(existing?.field_type ?? "text");
  const [required, setRequired] = useState<boolean>(existing?.required ?? false);
  const [optionsText, setOptionsText] = useState<string>((existing?.options ?? []).join("\n"));
  const [localError, setLocalError] = useState<string | null>(null);

  const needsOptions = fieldType === "select" || fieldType === "multiselect";

  const parsedOptions = useMemo(
    () =>
      optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [optionsText],
  );

  const handleSubmit = () => {
    setLocalError(null);
    if (!label.trim()) {
      setLocalError("Label is required.");
      return;
    }
    if (mode === "create" && !/^[a-z][a-z0-9_]{0,63}$/.test(fieldKey)) {
      setLocalError(
        "Field key must start with a lowercase letter and contain only lowercase letters, digits, and underscores.",
      );
      return;
    }
    if (needsOptions && parsedOptions.length === 0) {
      setLocalError("Add at least one option (one per line).");
      return;
    }
    onSubmit({
      field_key: fieldKey,
      label: label.trim(),
      field_type: fieldType,
      options: needsOptions ? parsedOptions : null,
      required,
    });
  };

  return (
    <StandardModal
      isOpen={true}
      title={mode === "create" ? "Add custom field" : "Edit custom field"}
      description={`For entity: ${CUSTOM_FIELD_ENTITY_LABELS[entityType]}`}
      submitButtonText={mode === "create" ? "Create" : "Save"}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Stack spacing={6}>
        <Stack spacing={2}>
          <LabelWithInfo
            text="Label"
            required
            info="The human-readable display name shown on records and table columns (e.g., 'Department Owner'). Can be edited later."
          />
          <Field
            id="cf-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Department owner"
          />
        </Stack>

        <Stack spacing={2}>
          <LabelWithInfo
            text="Field key"
            required
            info="The stable machine identifier used in the database. Lowercase letters, digits, and underscores only. Permanent once created — used to look up values even if the label is renamed later."
          />
          <Field
            id="cf-field-key"
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
            disabled={mode === "edit"}
            placeholder="e.g., department_owner"
            helperText={
              mode === "edit"
                ? "Field key is immutable after creation."
                : "Lowercase letters, digits, underscores. Used as a stable identifier."
            }
          />
        </Stack>

        <Select
          id="cf-field-type"
          label="Field type"
          value={fieldType}
          items={FIELD_TYPE_ITEMS}
          onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
          disabled={mode === "edit"}
          isRequired
        />

        {needsOptions && (
          <Field
            id="cf-options"
            label="Options (one per line)"
            type="description"
            rows={4}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
          />
        )}

        <Stack direction="row" alignItems="center" spacing={4}>
          <Toggle checked={required} onChange={(_e, checked) => setRequired(checked)} />
          <Typography sx={{ fontSize: 13, color: "text.primary" }}>Required</Typography>
        </Stack>

        {(localError || serverError) && (
          <Typography sx={{ fontSize: 12, color: "error.main" }}>
            {localError ?? serverError}
          </Typography>
        )}
      </Stack>
    </StandardModal>
  );
};

const LabelWithInfo: React.FC<{
  text: string;
  info: string;
  required?: boolean;
}> = ({ text, info, required }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ height: "22px" }}>
    <Typography
      component="p"
      sx={{
        fontSize: "13px",
        fontWeight: 500,
        color: "text.secondary",
        margin: 0,
      }}
    >
      {text}
      {required && (
        <Typography component="span" sx={{ color: "error.main", ml: 0.5 }}>
          *
        </Typography>
      )}
    </Typography>
    <Tooltip title={info} arrow placement="top">
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          color: "text.tertiary",
          cursor: "help",
        }}
      >
        <Info size={14} />
      </Box>
    </Tooltip>
  </Stack>
);

function extractErrorMessage(err: any): string {
  return (
    err?.response?.data?.error || err?.response?.data?.message || err?.message || "Operation failed"
  );
}

export default CustomFieldsTab;
