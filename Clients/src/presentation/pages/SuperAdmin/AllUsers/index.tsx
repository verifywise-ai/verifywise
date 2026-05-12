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
  SelectChangeEvent,
  Autocomplete,
  TextField,
  useTheme,
} from "@mui/material";
import { UserPlus, Users as UsersIcon, ArrowUp, ArrowDown } from "lucide-react";
import {
  getAllUsers,
  removeUser,
  updateUser,
  getOrganizations,
  inviteUserToOrg,
  GlobalUser,
  Organization,
} from "../../../../application/repository/superAdmin.repository";
import { ROLE_OPTIONS, ROLE_COLORS } from "../../../../application/constants/roles";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import SearchBox from "../../../components/Search/SearchBox";
import { EmptyState } from "../../../components/EmptyState";
import Select from "../../../components/Inputs/Select";
import singleTheme from "../../../themes/v1SingleTheme";
import { getSelectStyles } from "../../../utils/inputStyles";

const DeleteUserModal = ({
  target,
  onClose,
  onDeleted,
}: {
  target: GlobalUser | null;
  onClose: () => void;
  onDeleted: () => void;
}) => {
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await removeUser(target.id);
      onClose();
      onDeleted();
    } catch (error) {
      console.error("Failed to remove user:", error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <StandardModal
      isOpen={!!target}
      onClose={onClose}
      title="Remove User"
      description={`Remove "${target?.name} ${target?.surname || ""}" from ${target?.organization_name || "their organization"}?`}
      submitButtonText="Remove"
      onSubmit={handleSubmit}
      isSubmitting={deleting}
      submitButtonColor="error"
      maxWidth="480px"
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        This will permanently remove the user and all their data.
      </Typography>
    </StandardModal>
  );
};

const EditUserModal = ({
  target,
  onClose,
  onUpdated,
}: {
  target: GlobalUser | null;
  onClose: () => void;
  onUpdated: () => void;
}) => {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (target) {
      setName(target.name);
      setSurname(target.surname || "");
      setEmail(target.email);
      setRoleId(target.role_id);
      setError("");
    }
  }, [target]);

  const handleSubmit = async () => {
    if (!target) return;
    setSubmitting(true);
    setError("");
    try {
      await updateUser(target.id, {
        name: name.trim(),
        surname: surname.trim(),
        email: email.trim(),
        roleId,
      });
      onClose();
      onUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  const roleSelectItems = ROLE_OPTIONS.map((r) => ({ _id: r.value, name: r.label }));

  return (
    <StandardModal
      isOpen={!!target}
      onClose={onClose}
      title="Edit user"
      description={`Edit details for ${target?.name || "user"}`}
      submitButtonText="Save changes"
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      maxWidth="480px"
    >
      <Stack spacing={2}>
        <Field
          label="First name"
          isRequired
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ width: "100%" }}
        />
        <Field
          label="Last name"
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          sx={{ width: "100%" }}
        />
        <Field
          label="Email"
          isRequired
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ width: "100%" }}
        />
        <Stack spacing={0.5}>
          <Typography variant="body2" fontWeight={500}>
            Organization
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {target?.organization_name || "—"}
          </Typography>
        </Stack>
        <Select
          id="edit-role"
          label="Role"
          value={roleId}
          items={roleSelectItems}
          onChange={(e: SelectChangeEvent<string | number>) => setRoleId(Number(e.target.value))}
          getOptionValue={(item: { _id: string | number }) => item._id}
          sx={{ width: "100%" }}
        />
        <Stack spacing={0.5}>
          <Typography variant="body2" fontWeight={500}>
            Joined
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {target
              ? new Date(target.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "—"}
          </Typography>
        </Stack>
        <Stack spacing={0.5}>
          <Typography variant="body2" fontWeight={500}>
            Last login
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {target?.last_login
              ? new Date(target.last_login).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "Never"}
          </Typography>
        </Stack>
        {error && <Typography sx={{ fontSize: 13, color: "#D32F2F" }}>{error}</Typography>}
      </Stack>
    </StandardModal>
  );
};

const InviteUserModal = ({
  isOpen,
  onClose,
  onInvited,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInvited: () => void;
}) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [roleId, setRoleId] = useState(3);
  const [orgId, setOrgId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  useEffect(() => {
    if (isOpen) {
      getOrganizations()
        .then((response) => {
          const serverData = response.data as any;
          setOrganizations(serverData?.data || []);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const resetForm = () => {
    setEmail("");
    setName("");
    setSurname("");
    setRoleId(3);
    setOrgId("");
    setError("");
  };

  const handleSubmit = async () => {
    if (!orgId || !email.trim() || !name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await inviteUserToOrg(parseInt(orgId), {
        email: email.trim(),
        name: name.trim(),
        surname: surname.trim() || undefined,
        roleId,
      });
      resetForm();
      onClose();
      onInvited();
    } catch (err: any) {
      setError(err?.message || "Failed to invite user");
    } finally {
      setSubmitting(false);
    }
  };

  const orgSelectItems = [
    { _id: "" as string | number, name: "Select organization" },
    ...organizations.map((o) => ({ _id: String(o.id) as string | number, name: o.name })),
  ];
  const roleSelectItems = ROLE_OPTIONS.map((r) => ({ _id: r.value, name: r.label }));

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="Invite user"
      description="Send an invitation to a new user"
      submitButtonText="Send invite"
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      maxWidth="480px"
    >
      <Stack spacing={2}>
        <Select
          id="invite-org"
          label="Organization"
          value={orgId}
          items={orgSelectItems}
          onChange={(e: SelectChangeEvent<string | number>) => setOrgId(String(e.target.value))}
          getOptionValue={(item: { _id: string | number }) => item._id}
          sx={{ width: "100%" }}
        />
        <Field
          label="Email"
          isRequired
          placeholder="user@example.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ width: "100%" }}
        />
        <Field
          label="First name"
          isRequired
          placeholder="First name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ width: "100%" }}
        />
        <Field
          label="Last name"
          placeholder="Last name"
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          sx={{ width: "100%" }}
        />
        <Select
          id="invite-role"
          label="Role"
          value={roleId}
          items={roleSelectItems}
          onChange={(e: SelectChangeEvent<string | number>) => setRoleId(Number(e.target.value))}
          getOptionValue={(item: { _id: string | number }) => item._id}
          sx={{ width: "100%" }}
        />
        {error && <Typography sx={{ fontSize: 13, color: "#D32F2F" }}>{error}</Typography>}
      </Stack>
    </StandardModal>
  );
};

type SortField = "name" | "email" | "organization_name" | "role_name" | "created_at";

const AllUsers = () => {
  const theme = useTheme();
  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOrg, setFilterOrg] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [deleteTarget, setDeleteTarget] = useState<GlobalUser | null>(null);
  const [editTarget, setEditTarget] = useState<GlobalUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await getAllUsers();
      const serverData = response.data as any;
      setUsers(serverData?.data || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const orgOptions = useMemo(() => {
    const names = [...new Set(users.map((u) => u.organization_name).filter(Boolean))].sort();
    return [{ _id: "all", name: "All Organizations" }, ...names.map((n) => ({ _id: n, name: n }))];
  }, [users]);

  const roleFilterOptions = useMemo(() => {
    const roles = [...new Set(users.map((u) => u.role_name).filter(Boolean))].sort();
    return [{ _id: "all", name: "All Roles" }, ...roles.map((r) => ({ _id: r, name: r }))];
  }, [users]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (filterOrg !== "all") {
      list = list.filter((u) => u.organization_name === filterOrg);
    }
    if (filterRole !== "all") {
      list = list.filter((u) => u.role_name === filterRole);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(term) ||
          u.surname?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          u.organization_name?.toLowerCase().includes(term) ||
          u.role_name?.toLowerCase().includes(term),
      );
    }

    return [...list].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortField) {
        case "name":
          return dir * `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`);
        case "email":
          return dir * (a.email || "").localeCompare(b.email || "");
        case "organization_name":
          return dir * (a.organization_name || "").localeCompare(b.organization_name || "");
        case "role_name":
          return dir * (a.role_name || "").localeCompare(b.role_name || "");
        case "created_at":
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        default:
          return 0;
      }
    });
  }, [users, searchTerm, filterOrg, filterRole, sortField, sortDirection]);

  const tableStyles = singleTheme.tableStyles.primary;

  const columns: { field: SortField; label: string }[] = [
    { field: "name", label: "Name" },
    { field: "email", label: "Email" },
    { field: "organization_name", label: "Organization" },
    { field: "role_name", label: "Role" },
    { field: "created_at", label: "Joined" },
  ];

  return (
    <PageHeaderExtended
      title="Users"
      description="View and manage all users across all organizations."
      actionButton={
        <Button
          variant="contained"
          disableElevation
          startIcon={<UserPlus size={14} />}
          onClick={() => setInviteOpen(true)}
          sx={{
            textTransform: "none",
            height: 34,
            fontSize: "13px",
            borderRadius: "4px",
          }}
        >
          Invite user
        </Button>
      }
    >
      <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
        <SearchBox
          placeholder="Search users..."
          value={searchTerm}
          onChange={setSearchTerm}
          sx={{ maxWidth: 280 }}
        />
        <Autocomplete
          size="small"
          options={orgOptions}
          getOptionLabel={(opt) => opt.name}
          value={orgOptions.find((o) => o._id === filterOrg) || orgOptions[0]}
          onChange={(_e, val) => setFilterOrg((val?._id as string) ?? "all")}
          disableClearable={filterOrg === "all"}
          isOptionEqualToValue={(opt, val) => opt._id === val._id}
          sx={{ width: 220 }}
          componentsProps={{
            paper: {
              sx: {
                "borderRadius": theme.shape.borderRadius,
                "boxShadow": theme.boxShadow,
                "& .MuiAutocomplete-option": {
                  "fontSize": 13,
                  "color": theme.palette.text.primary,
                  "borderRadius": theme.shape.borderRadius,
                  "margin": "4px 8px",
                  "transition": "color 0.2s ease, background-color 0.2s ease",
                  "&:hover": {
                    backgroundColor: theme.palette.background.accent,
                    color: theme.palette.primary.main,
                  },
                  "&[aria-selected='true']": {
                    backgroundColor: theme.palette.background.accent,
                  },
                },
              },
            },
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="All Organizations"
              sx={{
                "& .MuiOutlinedInput-root": {
                  fontSize: 13,
                  backgroundColor:
                    filterOrg !== "all"
                      ? theme.palette.background.fill
                      : theme.palette.background.main,
                  ...getSelectStyles(theme),
                },
              }}
            />
          )}
        />
        <Select
          id="filter-role"
          value={filterRole}
          items={roleFilterOptions}
          onChange={(e: SelectChangeEvent<string | number>) =>
            setFilterRole(String(e.target.value))
          }
          getOptionValue={(item: { _id: string | number }) => item._id}
          isFilterApplied={filterRole !== "all"}
          sx={{ width: 150 }}
        />
      </Stack>

      {loading ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Loading users...</Typography>
        </Box>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          message={searchTerm ? `No users match "${searchTerm}"` : "No users found."}
          icon={UsersIcon}
          showBorder
        />
      ) : (
        <TableContainer sx={{ ...tableStyles.frame }}>
          <Table>
            <TableHead>
              <TableRow sx={tableStyles.header.row}>
                {columns.map(({ field, label }) => {
                  const isActive = sortField === field;
                  const SortIcon = isActive && sortDirection === "desc" ? ArrowDown : ArrowUp;
                  return (
                    <TableCell
                      key={field}
                      sx={{
                        ...tableStyles.header.cell,
                        "cursor": "pointer",
                        "userSelect": "none",
                        "&:hover": { color: "#1d2939" },
                      }}
                      onClick={() => handleSort(field)}
                    >
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        {label}
                        <SortIcon size={12} style={{ opacity: isActive ? 1 : 0.3 }} />
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
              {filteredUsers.map((user) => {
                const colors = ROLE_COLORS[user.role_name] || { bg: "#f3f4f6", text: "#6b7280" };
                return (
                  <TableRow
                    key={user.id}
                    sx={{ ...tableStyles.body.row, cursor: "pointer" }}
                    onClick={() => setEditTarget(user)}
                  >
                    <TableCell sx={tableStyles.body.cell}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            backgroundColor: "#f3f4f6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#6b7280",
                          }}
                        >
                          {user.name?.[0]?.toUpperCase() || "?"}
                        </Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                          {user.name} {user.surname}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={tableStyles.body.cell}>
                      <Typography sx={{ fontSize: 13 }}>{user.email}</Typography>
                    </TableCell>
                    <TableCell sx={tableStyles.body.cell}>
                      <Typography sx={{ fontSize: 13 }}>
                        {user.organization_name
                          ? `${user.organization_name} (org:${user.organization_id})`
                          : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={tableStyles.body.cell}>
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          px: 1,
                          py: 0.25,
                          borderRadius: "4px",
                          fontSize: 12,
                          fontWeight: 500,
                          backgroundColor: colors.bg,
                          color: colors.text,
                        }}
                      >
                        {user.role_name}
                      </Box>
                    </TableCell>
                    <TableCell sx={tableStyles.body.cell}>
                      {new Date(user.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell sx={{ ...tableStyles.body.cell, textAlign: "right" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(user);
                        }}
                        sx={{
                          ...tableStyles.body.button,
                          "color": "#dc2626",
                          "borderColor": "#fecaca",
                          "&:hover": {
                            backgroundColor: "#dc2626",
                            color: "#fff",
                            border: "1px solid #dc2626",
                          },
                        }}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <DeleteUserModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={fetchUsers}
      />
      <EditUserModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={fetchUsers}
      />
      <InviteUserModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={fetchUsers}
      />
    </PageHeaderExtended>
  );
};

export default AllUsers;
