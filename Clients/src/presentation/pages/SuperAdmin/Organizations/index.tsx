import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Stack,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
} from "@mui/material";
import { Building, Plus, Trash2, Users, ArrowUp, ArrowDown } from "lucide-react";
import {
  getOrganizations,
  createOrganization,
  deleteOrganization,
  Organization,
} from "../../../../application/repository/superAdmin.repository";
import { useNavigate } from "react-router-dom";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import SearchBox from "../../../components/Search/SearchBox";
import { EmptyState } from "../../../components/EmptyState";
import singleTheme from "../../../themes/v1SingleTheme";

/** Isolated create modal — its input state won't re-render the parent table */
const CreateOrgModal = ({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createOrganization({ name: name.trim() });
      setName("");
      onClose();
      onCreated();
    } catch (error) {
      console.error("Failed to create organization:", error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={() => { setName(""); onClose(); }}
      title="Create Organization"
      description="Enter a name for the new organization"
      submitButtonText="Create"
      onSubmit={handleSubmit}
      isSubmitting={creating}
      maxWidth="480px"
    >
      <Stack spacing={2}>
        <Field
          label="Organization Name"
          isRequired
          placeholder="Enter organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ width: "100%" }}
        />
      </Stack>
    </StandardModal>
  );
};

/** Isolated delete modal */
const DeleteOrgModal = ({
  target,
  onClose,
  onDeleted,
}: {
  target: Organization | null;
  onClose: () => void;
  onDeleted: () => void;
}) => {
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await deleteOrganization(target.id);
      onClose();
      onDeleted();
    } catch (error) {
      console.error("Failed to delete organization:", error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <StandardModal
      isOpen={!!target}
      onClose={onClose}
      title="Delete Organization"
      description={`Are you sure you want to delete "${target?.name}"?`}
      submitButtonText="Delete"
      onSubmit={handleSubmit}
      isSubmitting={deleting}
      submitButtonColor="error"
      maxWidth="480px"
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        This will permanently delete the organization and all its users, projects,
        and data. This action cannot be undone.
      </Typography>
    </StandardModal>
  );
};

const Organizations = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"name" | "user_count" | "created_at">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);

  const fetchOrganizations = useCallback(async () => {
    try {
      const response = await getOrganizations();
      const serverData = response.data as any;
      setOrganizations(serverData?.data || []);
    } catch (error) {
      console.error("Failed to fetch organizations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredOrganizations = useMemo(() => {
    let list = organizations;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((org) => org.name.toLowerCase().includes(term));
    }

    return [...list].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortField) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "user_count":
          return dir * ((a.user_count ?? 0) - (b.user_count ?? 0));
        case "created_at":
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        default:
          return 0;
      }
    });
  }, [organizations, searchTerm, sortField, sortDirection]);

  const tableStyles = singleTheme.tableStyles.primary;

  return (
    <PageHeaderExtended
      title="Organizations"
      description="Manage all organizations on the platform. Create, view, and manage organization access."
      actionButton={
        <Button
          variant="contained"
          disableElevation
          startIcon={<Plus size={14} />}
          onClick={() => setCreateOpen(true)}
          sx={{
            textTransform: "none",
            height: 34,
            fontSize: "13px",
            borderRadius: "4px",
          }}
        >
          Create Organization
        </Button>
      }
    >
      {/* Search bar */}
      <Stack direction="row" alignItems="center" gap={1.5}>
        <SearchBox
          placeholder="Search organizations..."
          value={searchTerm}
          onChange={setSearchTerm}
          sx={{ maxWidth: 320 }}
        />
        <Typography
          sx={{ fontSize: "13px", color: "text.secondary", whiteSpace: "nowrap" }}
        >
          {filteredOrganizations.length} organization{filteredOrganizations.length !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {/* Table */}
      {loading ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Loading organizations...
          </Typography>
        </Box>
      ) : filteredOrganizations.length === 0 ? (
        <EmptyState
          message={
            searchTerm
              ? `No organizations match "${searchTerm}"`
              : "No organizations yet. Create one to get started."
          }
          icon={Building}
          showBorder
        />
      ) : (
        <TableContainer sx={{ ...tableStyles.frame }}>
          <Table>
            <TableHead>
              <TableRow sx={tableStyles.header.row}>
                {([
                  { field: "name" as const, label: "Organization" },
                  { field: "user_count" as const, label: "Users" },
                  { field: "created_at" as const, label: "Created" },
                ]).map(({ field, label }) => {
                  const isActive = sortField === field;
                  const SortIcon = isActive && sortDirection === "desc" ? ArrowDown : ArrowUp;
                  return (
                    <TableCell
                      key={field}
                      sx={{
                        ...tableStyles.header.cell,
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover": { color: "#1d2939" },
                      }}
                      onClick={() => handleSort(field)}
                    >
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        {label}
                        <SortIcon
                          size={12}
                          style={{ opacity: isActive ? 1 : 0.3 }}
                        />
                      </Stack>
                    </TableCell>
                  );
                })}
                <TableCell sx={{ ...tableStyles.header.cell, textAlign: "right" }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrganizations.map((org) => (
                <TableRow key={org.id} sx={tableStyles.body.row}>
                  <TableCell sx={tableStyles.body.cell}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: "6px",
                          backgroundColor: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Building size={14} color="#16a34a" />
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        {org.name} (org:{org.id})
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={tableStyles.body.cell}>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Users size={13} color="#6b7280" />
                      <Typography sx={{ fontSize: 13 }}>
                        {org.user_count ?? 0}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={tableStyles.body.cell}>
                    {new Date(org.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell sx={{ ...tableStyles.body.cell, textAlign: "right" }}>
                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Users size={13} />}
                        onClick={() =>
                          navigate(`/super-admin/organizations/${org.id}/users`)
                        }
                        sx={tableStyles.body.button}
                      >
                        Users
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Trash2 size={13} />}
                        onClick={() => setDeleteTarget(org)}
                        sx={{
                          ...tableStyles.body.button,
                          color: "#dc2626",
                          borderColor: "#fecaca",
                          "&:hover": {
                            backgroundColor: "#dc2626",
                            color: "#fff",
                            border: "1px solid #dc2626",
                          },
                        }}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateOrgModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchOrganizations}
      />
      <DeleteOrgModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={fetchOrganizations}
      />
    </PageHeaderExtended>
  );
};

export default Organizations;
