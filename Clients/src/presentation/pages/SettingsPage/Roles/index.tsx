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
import singleTheme from "../../../themes/v1SingleTheme";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";
import { useRoles } from "../../../../application/hooks/useRoles";
import {
  usePermissionCatalog,
  useReplaceRolePermissions,
  useRolePermissions,
} from "../../../../application/hooks/useRolePermissions";
import type { PermissionCatalogEntry } from "../../../../application/repository/role.repository";

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
 * Custom roles admin (the R1 gap of #5253): pick one of the organization's
 * custom roles and edit its permission matrix. Writes go through
 * PUT /roles/:id/permissions and only touch org-owned roles — the backend
 * rejects built-in roles.
 */
const RolesTab: React.FC = () => {
  const theme = useTheme();
  const canManageRoles = useHasPermission("roles.manage", { fallbackToAdmin: true });

  const { roles, loading: rolesLoading } = useRoles();
  const { data: catalog = [], isLoading: catalogLoading } = usePermissionCatalog();

  const customRoles = useMemo(() => ((roles as RoleRow[]) ?? []).filter(isCustomRole), [roles]);

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const { data: granted = [] } = useRolePermissions(selectedRoleId);
  const replaceMutation = useReplaceRolePermissions();

  // Local editable copy of the matrix: permission key -> allowed.
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (customRoles.length > 0 && selectedRoleId === null) {
      setSelectedRoleId(customRoles[0].id);
    }
  }, [customRoles, selectedRoleId]);

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
    await replaceMutation.mutateAsync({
      id: selectedRoleId,
      permissions: catalog.map((entry) => ({
        permission_key: entry.key,
        allowed: matrix[entry.key] ?? false,
      })),
    });
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

  return (
    <Stack sx={{ mt: 3, width: "100%" }} spacing={4}>
      <Box>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.black" }}>
          Roles and permissions
        </Typography>
        <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5 }}>
          Custom roles start with no permissions. Toggle what a role can do, then save — users with
          that role get exactly these permissions.
        </Typography>
      </Box>

      {rolesLoading || catalogLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={20} />
        </Box>
      ) : customRoles.length === 0 ? (
        <Box
          sx={{
            p: 6,
            border: `1px dashed ${theme.palette.border.light}`,
            borderRadius: theme.shape.borderRadius,
            textAlign: "center",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            No custom roles yet. The API supports custom roles; create one to edit its permission
            matrix here.
          </Typography>
        </Box>
      ) : (
        <>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={selectedRoleId}
            onChange={(_e, value) => value !== null && setSelectedRoleId(value)}
            aria-label="Custom role"
          >
            {customRoles.map((role) => (
              <ToggleButton key={role.id} value={role.id}>
                {role.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {selectedRole && (
            <>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {selectedRole.description || "Custom organization role"}
              </Typography>

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
                            <TableCell sx={singleTheme.tableStyles.primary.body.cell} align="right">
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

              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <CustomizableButton
                  variant="contained"
                  text="Save permissions"
                  onClick={handleSave}
                  isDisabled={!dirty || replaceMutation.isPending}
                  sx={{
                    backgroundColor: "brand.primary",
                    border: "1px solid brand.primary",
                    gap: 2,
                  }}
                />
              </Box>
            </>
          )}
        </>
      )}
    </Stack>
  );
};

export default RolesTab;
