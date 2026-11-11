import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import { Pencil, Plus, Trash2 } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { CustomizableButton } from "../../../components/button/customizable-button";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";
import { useRoles } from "../../../../application/hooks/useRoles";
import {
  usePermissionCatalog,
  useReplaceRolePermissions,
  useRolePermissions,
} from "../../../../application/hooks/useRolePermissions";
import {
  useCreateRole,
  useDeleteRole,
  useUpdateRole,
  type RoleInput,
} from "../../../../application/hooks/useRoleMutations";
import type { PermissionCatalogEntry } from "../../../../application/repository/role.repository";
import RoleFormModal from "./RoleFormModal";

interface RoleRow {
  id: number;
  name: string;
  description?: string | null;
  organization_id?: number | null;
  organizationId?: number | null;
}

/** True for organization-owned (custom) roles; built-ins have a NULL org. */
const isCustomRole = (role: RoleRow): boolean =>
  (role.organization_id ?? role.organizationId ?? null) !== null;

function groupByModule(catalog: PermissionCatalogEntry[]): Map<string, PermissionCatalogEntry[]> {
  const groups = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of catalog) {
    const list = groups.get(entry.module) ?? [];
    list.push(entry);
    groups.set(entry.module, list);
  }
  return groups;
}

/**
 * The server's message for a failed role write, or the fallback. 5xx bodies
 * only carry the HTTP phrase ("Internal Server Error"), so they get the
 * fallback too.
 */
function roleErrorMessage(error: unknown, fallback: string): string {
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : undefined;
  if (status === undefined || status >= 500 || !message) return fallback;
  return message;
}

const ICON_PROPS = { size: 14, strokeWidth: 1.5 } as const;

type FormState = { mode: "create" } | { mode: "edit"; role: RoleRow } | null;

/**
 * Custom roles admin (#5253): create, rename and delete the organization's
 * custom roles, and edit each one's permission matrix. Built-in roles
 * (Admin, Reviewer, Editor, Auditor) are not listed: their permissions are
 * fixed and the server refuses to change them.
 */
const RolesTab: React.FC = () => {
  const theme = useTheme();
  const canManageRoles = useHasPermission("roles.manage", { fallbackToAdmin: true });

  const { roles, loading: rolesLoading } = useRoles();
  const { data: catalog = [], isLoading: catalogLoading } = usePermissionCatalog();

  const allRoles = useMemo(() => (roles as RoleRow[]) ?? [], [roles]);
  const customRoles = useMemo(() => allRoles.filter(isCustomRole), [allRoles]);
  const knownRoleNames = useMemo(
    () => allRoles.map((r) => ({ id: r.id, name: r.name, isBuiltIn: !isCustomRole(r) })),
    [allRoles],
  );

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const { data: granted = [], isLoading: grantedLoading } = useRolePermissions(selectedRoleId);
  const replaceMutation = useReplaceRolePermissions();
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();

  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Local editable copy of the matrix: permission key -> allowed.
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});

  // Keep the selection on an existing custom role: pick the first one when
  // nothing (or a role that no longer exists) is selected.
  useEffect(() => {
    if (rolesLoading) return;
    const stillExists = customRoles.some((r) => r.id === selectedRoleId);
    if (!stillExists) {
      setSelectedRoleId(customRoles[0]?.id ?? null);
    }
  }, [customRoles, selectedRoleId, rolesLoading]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const row of granted) {
      next[row.permission_key] = row.allowed;
    }
    setMatrix(next);
  }, [granted]);

  const selectedRole = customRoles.find((r) => r.id === selectedRoleId) ?? null;
  const modules = useMemo(() => groupByModule(catalog), [catalog]);

  const dirty = useMemo(() => {
    for (const entry of catalog) {
      const current = matrix[entry.key] ?? false;
      const original = granted.find((g) => g.permission_key === entry.key)?.allowed ?? false;
      if (current !== original) return true;
    }
    return false;
  }, [catalog, matrix, granted]);

  const handleSave = async () => {
    if (selectedRoleId === null) return;
    setSaveError(null);
    try {
      await replaceMutation.mutateAsync({
        id: selectedRoleId,
        permissions: catalog.map((entry) => ({
          permission_key: entry.key,
          allowed: matrix[entry.key] ?? false,
        })),
      });
    } catch {
      setSaveError("Could not save the permissions. Please try again.");
    }
  };

  const openCreate = () => {
    setFormError(null);
    setForm({ mode: "create" });
  };

  const closeForm = () => {
    if (createMutation.isPending || updateMutation.isPending) return;
    setForm(null);
    setFormError(null);
  };

  const handleFormSubmit = async (values: RoleInput) => {
    if (!form) return;
    setFormError(null);
    try {
      if (form.mode === "create") {
        const created = await createMutation.mutateAsync(values);
        // The roles list has been refetched by now, so the new role is
        // selectable: open its (empty) permission matrix straight away.
        if (created?.id != null) setSelectedRoleId(created.id);
      } else {
        await updateMutation.mutateAsync({ id: form.role.id, body: values });
      }
      setSaveError(null);
      setForm(null);
    } catch (error) {
      setFormError(
        roleErrorMessage(
          error,
          form.mode === "create"
            ? "Could not create the role. Please try again."
            : "Could not save the role. Please try again.",
        ),
      );
    }
  };

  const openDelete = (role: RoleRow) => {
    setDeleteError(null);
    setDeleteTarget(role);
  };

  const closeDelete = () => {
    if (deleteMutation.isPending) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      setDeleteError(
        status === 409
          ? "People still have this role. Move them to another role in the Team tab, then try again."
          : roleErrorMessage(error, "Could not delete the role. Please try again."),
      );
    }
  };

  if (!canManageRoles) {
    return (
      <Stack sx={{ mt: 3, width: "100%" }}>
        <Stack sx={{ pt: theme.spacing(20) }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Only Admins can manage roles.
          </Typography>
        </Stack>
      </Stack>
    );
  }

  const newRoleButton = (
    <CustomizableButton
      variant="contained"
      text="New role"
      icon={<Plus {...ICON_PROPS} />}
      onClick={openCreate}
      testId="roles-new-role"
      sx={{ height: "30px", gap: "8px", flexShrink: 0 }}
    />
  );

  return (
    <Stack sx={{ mt: 3, width: "100%" }} spacing={4}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.black" }}>
            Roles and permissions
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: "4px" }}>
            Create roles for your organization and choose what each one can do. Built-in roles
            (Admin, Reviewer, Editor and Auditor) keep fixed permissions and can't be renamed or
            deleted.
          </Typography>
        </Box>
        {customRoles.length > 0 && newRoleButton}
      </Box>

      {rolesLoading || catalogLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: "48px" }}>
          <CircularProgress size={20} aria-label="Loading roles" />
        </Box>
      ) : customRoles.length === 0 ? (
        <Box
          sx={{
            p: "32px",
            border: `1px dashed ${theme.palette.border.light}`,
            borderRadius: theme.shape.borderRadius,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            textAlign: "center",
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>
            No custom roles yet
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", maxWidth: "480px" }}>
            Create a role, choose what it can do, then assign it to people in the Team tab.
          </Typography>
          {newRoleButton}
        </Box>
      ) : (
        <>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={selectedRoleId}
            onChange={(_e, value) => {
              if (value === null) return;
              setSaveError(null);
              setSelectedRoleId(value);
            }}
            aria-label="Custom role"
            sx={{ flexWrap: "wrap" }}
          >
            {customRoles.map((role) => (
              <ToggleButton key={role.id} value={role.id} sx={{ height: "30px" }}>
                {role.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {selectedRole && (
            <>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                  p: "16px",
                  border: `1px solid ${theme.palette.border.light}`,
                  borderRadius: theme.shape.borderRadius,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "text.primary",
                      wordBreak: "break-word",
                    }}
                  >
                    {selectedRole.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: "text.secondary",
                      mt: "4px",
                      wordBreak: "break-word",
                    }}
                  >
                    {selectedRole.description || "Custom organization role"}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <CustomizableButton
                    variant="outlined"
                    color="secondary"
                    text="Edit"
                    icon={<Pencil {...ICON_PROPS} />}
                    ariaLabel={`Edit ${selectedRole.name}`}
                    testId="roles-edit-role"
                    onClick={() => {
                      setFormError(null);
                      setForm({ mode: "edit", role: selectedRole });
                    }}
                    sx={{ height: "30px", gap: "8px" }}
                  />
                  <CustomizableButton
                    variant="outlined"
                    color="error"
                    text="Delete"
                    icon={<Trash2 {...ICON_PROPS} />}
                    ariaLabel={`Delete ${selectedRole.name}`}
                    testId="roles-delete-role"
                    onClick={() => openDelete(selectedRole)}
                    sx={{ height: "30px", gap: "8px" }}
                  />
                </Box>
              </Box>

              {grantedLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: "24px" }}>
                  <CircularProgress size={20} aria-label="Loading permissions" />
                </Box>
              ) : (
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
                    <TableHead
                      sx={{
                        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                      }}
                    >
                      <TableRow>
                        <TableCell sx={singleTheme.tableStyles.primary.header.cell}>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "13px" }}>
                            PERMISSION
                          </Typography>
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.header.cell} align="right">
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "13px" }}>
                            ALLOWED
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...modules.entries()].map(([module, entries]) => (
                        <React.Fragment key={module}>
                          <TableRow sx={singleTheme.tableStyles.primary.body.row}>
                            <TableCell
                              colSpan={2}
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                fontWeight: 700,
                                fontSize: "12px",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "text.secondary",
                              }}
                            >
                              {module}
                            </TableCell>
                          </TableRow>
                          {entries.map((entry) => (
                            <TableRow key={entry.key} sx={singleTheme.tableStyles.primary.body.row}>
                              <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                                <Typography sx={{ fontSize: 13 }}>{entry.key}</Typography>
                                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                                  {entry.description}
                                </Typography>
                              </TableCell>
                              <TableCell
                                sx={singleTheme.tableStyles.primary.body.cell}
                                align="right"
                              >
                                <ToggleButtonGroup
                                  size="small"
                                  exclusive
                                  value={(matrix[entry.key] ?? false) ? "yes" : "no"}
                                  onChange={(_e, value) => {
                                    if (value === null) return;
                                    setMatrix((prev) => ({
                                      ...prev,
                                      [entry.key]: value === "yes",
                                    }));
                                  }}
                                  aria-label={entry.key}
                                >
                                  <ToggleButton value="yes">Allow</ToggleButton>
                                  <ToggleButton value="no">Deny</ToggleButton>
                                </ToggleButtonGroup>
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {saveError && (
                  <Typography role="alert" sx={{ fontSize: 13, color: theme.palette.error.main }}>
                    {saveError}
                  </Typography>
                )}
                <CustomizableButton
                  variant="contained"
                  text="Save permissions"
                  onClick={handleSave}
                  isDisabled={!dirty || replaceMutation.isPending}
                  sx={{
                    backgroundColor: "brand.primary",
                    border: "1px solid brand.primary",
                    gap: "8px",
                  }}
                />
              </Box>
            </>
          )}
        </>
      )}

      {form && (
        <RoleFormModal
          mode={form.mode}
          initial={
            form.mode === "edit"
              ? {
                  id: form.role.id,
                  name: form.role.name,
                  description: form.role.description ?? "",
                }
              : undefined
          }
          existingRoles={knownRoleNames}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          serverError={formError}
          onClose={closeForm}
          onSubmit={handleFormSubmit}
        />
      )}

      {deleteTarget && (
        <ConfirmationModal
          isOpen
          title="Delete role"
          body={
            <Stack sx={{ gap: "8px" }}>
              <Typography sx={{ fontSize: 13 }}>
                Delete "{deleteTarget.name}"? Its permission settings are removed too. You can only
                delete a role nobody has, so move people to another role in the Team tab first.
              </Typography>
              {deleteError && (
                <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }}>
                  {deleteError}
                </Typography>
              )}
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Delete role"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          isLoading={deleteMutation.isPending}
          onCancel={closeDelete}
          onProceed={handleDelete}
        />
      )}
    </Stack>
  );
};

export default RolesTab;
