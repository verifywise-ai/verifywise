import React, { useEffect, useMemo, useState } from "react";
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
import { Plus as PlusIcon, Trash2, Pencil, Info } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { CustomizableButton } from "../../../components/button/customizable-button";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import Checkbox from "../../../components/Inputs/Checkbox";
import { useRoles } from "../../../../application/hooks/useRoles";
import {
  useMyPermissions,
  usePermissionCatalog,
  useReplaceRolePermissions,
  useRolePermissions,
} from "../../../../application/hooks/useRolePermissions";
import {
  createRole,
  deleteRole,
  updateRole,
} from "../../../../application/repository/role.repository";
import type { RolePermissionInput } from "../../../../application/repository/rolePermissions.repository";

const TABLE_COLUMNS = [
  { id: "name", label: "NAME" },
  { id: "description", label: "DESCRIPTION" },
  { id: "type", label: "TYPE" },
  { id: "actions", label: "" },
];

const Roles: React.FC = () => {
  const theme = useTheme();
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  const { roles, loading: rolesLoading, refreshRoles } = useRoles();
  const { data: catalog, isLoading: catalogLoading } = usePermissionCatalog();

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; name: string; description: string } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [crudPending, setCrudPending] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );
  const isCustomRole = (role: { organization_id?: number | null } | null): boolean =>
    !!role && role.organization_id != null;

  if (!permissionsLoading && !can("roles.manage")) {
    return (
      <Stack sx={{ mt: 3, width: "100%" }}>
        <Stack sx={{ pt: theme.spacing(20) }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            You don't have permission to manage roles.
          </Typography>
        </Stack>
      </Stack>
    );
  }

  const runCrud = async (fn: () => Promise<any>, onDone: () => void) => {
    setServerError(null);
    setCrudPending(true);
    try {
      await fn();
      await refreshRoles();
      onDone();
    } catch (err: any) {
      setServerError(extractErrorMessage(err));
    } finally {
      setCrudPending(false);
    }
  };

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
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.black" }}>Roles</Typography>
          <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5 }}>
            Create custom roles for your organization and choose exactly what each one can do.
            Built-in roles (Admin, Editor, Reviewer, Auditor) are fixed and cannot be changed.
          </Typography>
        </Box>
        <CustomizableButton
          variant="contained"
          text="Add role"
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

      {serverError && !creating && !editing && !confirmDelete && (
        <Typography sx={{ fontSize: 12, color: "error.main", mb: 2 }}>{serverError}</Typography>
      )}

      {rolesLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={20} />
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
              {roles.map((role) => (
                <TableRow
                  key={role.id}
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                    cursor: "pointer",
                    backgroundColor:
                      selectedRoleId === role.id ? theme.palette.background.main : undefined,
                  }}
                  onClick={() => setSelectedRoleId(role.id)}
                >
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{role.name}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {role.description}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Chip
                      label={isCustomRole(role) ? "Custom" : "Built-in"}
                      sx={{ fontSize: "11px", height: "20px", borderRadius: "4px" }}
                    />
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell} align="right">
                    {isCustomRole(role) && (
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <IconButton
                          size="small"
                          disableRipple
                          onClick={(e) => {
                            e.stopPropagation();
                            setServerError(null);
                            setEditing({
                              id: role.id,
                              name: role.name,
                              description: role.description,
                            });
                          }}
                          title="Edit role"
                        >
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton
                          size="small"
                          disableRipple
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete({ id: role.id, name: role.name });
                          }}
                          title="Delete role"
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {selectedRole && (
        <PermissionMatrix
          key={selectedRole.id}
          roleId={selectedRole.id}
          roleName={selectedRole.name}
          readOnly={!isCustomRole(selectedRole)}
          catalog={catalog ?? []}
          catalogLoading={catalogLoading}
        />
      )}

      {creating && (
        <RoleFormModal
          mode="create"
          serverError={serverError}
          isSubmitting={crudPending}
          onClose={() => {
            setCreating(false);
            setServerError(null);
          }}
          onSubmit={(input) =>
            runCrud(
              () => createRole({ body: input }),
              () => setCreating(false),
            )
          }
        />
      )}

      {editing && (
        <RoleFormModal
          mode="edit"
          existing={editing}
          serverError={serverError}
          isSubmitting={crudPending}
          onClose={() => {
            setEditing(null);
            setServerError(null);
          }}
          onSubmit={(input) =>
            runCrud(
              () => updateRole({ id: editing.id, body: input }),
              () => setEditing(null),
            )
          }
        />
      )}

      {confirmDelete && (
        <ConfirmationModal
          isOpen={true}
          title="Delete role"
          body={
            <Typography fontSize={13}>
              This will permanently remove the "{confirmDelete.name}" role. Roles still assigned to
              team members cannot be deleted. This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          isLoading={crudPending}
          onCancel={() => setConfirmDelete(null)}
          onProceed={() =>
            runCrud(
              () => deleteRole({ id: confirmDelete.id }),
              () => {
                setConfirmDelete(null);
                if (selectedRoleId === confirmDelete.id) setSelectedRoleId(null);
              },
            )
          }
        />
      )}
    </Stack>
  );
};

interface PermissionMatrixProps {
  roleId: number;
  roleName: string;
  readOnly: boolean;
  catalog: Array<{ key: string; module: string; description: string }>;
  catalogLoading: boolean;
}

const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  roleId,
  roleName,
  readOnly,
  catalog,
  catalogLoading,
}) => {
  const theme = useTheme();
  const { data: grantedKeys, isLoading: permissionsLoading } = useRolePermissions(roleId);
  const replaceMutation = useReplaceRolePermissions();

  const [draft, setDraft] = useState<Set<string> | null>(null);

  // Reset the draft whenever the server state for this role arrives/changes.
  useEffect(() => {
    setDraft(grantedKeys ? new Set(grantedKeys) : null);
  }, [grantedKeys]);

  const grouped = useMemo(() => {
    const byModule = new Map<string, Array<{ key: string; description: string }>>();
    for (const entry of catalog) {
      const list = byModule.get(entry.module) ?? [];
      list.push({ key: entry.key, description: entry.description });
      byModule.set(entry.module, list);
    }
    return Array.from(byModule.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const dirty =
    draft != null &&
    grantedKeys != null &&
    (draft.size !== grantedKeys.length || grantedKeys.some((key) => !draft.has(key)));

  const toggle = (key: string, checked: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev ?? []);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleSave = () => {
    if (!draft) return;
    const permissions: RolePermissionInput[] = catalog.map((entry) => ({
      permission_key: entry.key,
      allowed: draft.has(entry.key),
    }));
    replaceMutation.mutate({ roleId, permissions });
  };

  return (
    <Box sx={{ mt: 4, maxWidth: theme.spacing(480) }}>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.black" }}>
          Permissions — {roleName}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5 }}>
          {readOnly
            ? "Built-in roles have a fixed permission set that mirrors the original behavior."
            : "Grant only what this role needs. A custom role with no permissions can sign in but cannot do anything."}
        </Typography>
      </Box>

      {permissionsLoading || catalogLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <Stack spacing={3}>
          {grouped.map(([module, entries]) => (
            <Box
              key={module}
              sx={{
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: "4px",
                p: "16px",
                backgroundColor: theme.palette.background.main,
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>{module}</Typography>
              <Stack spacing={1}>
                {entries.map((entry) => (
                  <Stack
                    key={entry.key}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ minHeight: "28px" }}
                  >
                    <Checkbox
                      id={`perm-${entry.key}`}
                      isChecked={draft?.has(entry.key) ?? false}
                      value={entry.key}
                      onChange={(e) => toggle(entry.key, e.target.checked)}
                      isDisabled={readOnly || replaceMutation.isPending}
                      size="small"
                    />
                    <Typography sx={{ fontSize: 13, color: "text.primary" }}>
                      {entry.description}
                    </Typography>
                    <Tooltip title={entry.key} arrow placement="top">
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          color: "text.tertiary",
                          cursor: "help",
                        }}
                      >
                        <Info size={13} />
                      </Box>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}

          {!readOnly && (
            <Stack direction="row" justifyContent="flex-end" sx={{ pt: 1 }}>
              <CustomizableButton
                variant="contained"
                text={replaceMutation.isPending ? "Saving…" : "Save permissions"}
                onClick={handleSave}
                disabled={!dirty || replaceMutation.isPending}
                sx={{
                  backgroundColor: "brand.primary",
                  border: "1px solid brand.primary",
                  gap: 2,
                }}
              />
            </Stack>
          )}

          {replaceMutation.isError && (
            <Typography sx={{ fontSize: 12, color: "error.main" }}>
              {extractErrorMessage(replaceMutation.error)}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
};

interface RoleFormModalProps {
  mode: "create" | "edit";
  existing?: { name: string; description: string };
  serverError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string }) => void;
}

const RoleFormModal: React.FC<RoleFormModalProps> = ({
  mode,
  existing,
  serverError,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = () => {
    setLocalError(null);
    if (!name.trim()) {
      setLocalError("Name is required.");
      return;
    }
    if (!description.trim()) {
      setLocalError("Description is required.");
      return;
    }
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <StandardModal
      isOpen={true}
      title={mode === "create" ? "Add role" : "Edit role"}
      description={
        mode === "create"
          ? "Create a custom role for your organization, then grant permissions below."
          : "Renaming a role signs out users who currently hold it."
      }
      submitButtonText={mode === "create" ? "Create" : "Save"}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography
            component="p"
            sx={{ fontSize: "13px", fontWeight: 500, color: "text.secondary", margin: 0 }}
          >
            Name
            <Typography component="span" sx={{ color: "error.main", ml: 0.5 }}>
              *
            </Typography>
          </Typography>
          <Field
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., AI Engineer"
            disabled={isSubmitting}
          />
        </Stack>

        <Stack spacing={2}>
          <Typography
            component="p"
            sx={{ fontSize: "13px", fontWeight: 500, color: "text.secondary", margin: 0 }}
          >
            Description
            <Typography component="span" sx={{ color: "error.main", ml: 0.5 }}>
              *
            </Typography>
          </Typography>
          <Field
            id="role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this role for?"
            disabled={isSubmitting}
          />
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

function extractErrorMessage(err: any): string {
  return (
    err?.response?.data?.error || err?.response?.data?.message || err?.message || "Operation failed"
  );
}

export default Roles;
