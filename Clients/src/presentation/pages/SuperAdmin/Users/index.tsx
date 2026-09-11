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
import { UserPlus, Users as UsersIcon } from "lucide-react";
import {
  getOrgUsers,
  getOrgInvitations,
  inviteUserToOrg,
  createUserInOrg,
  removeUser,
  OrgUser,
  OrgInvitation,
} from "../../../../application/repository/superAdmin.repository";
import { useParams } from "react-router";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import SearchBox from "../../../components/Search/SearchBox";
import { EmptyState } from "../../../components/EmptyState";
import { ROLE_COLORS } from "../../../../application/constants/roles";
import UserFormFields, {
  UserFormMode,
  UserFormValues,
} from "../../../components/SuperAdmin/UserFormFields";
import { passwordValidation } from "../../../../application/validations/passwordValidation";
import { EmailAvailabilityStatus } from "../../../../application/hooks/useEmailAvailability";
import singleTheme from "../../../themes/v1SingleTheme";
import { displayFormattedDate } from "../../../tools/isoDateToString";

const EMPTY_USER_FORM: UserFormValues = {
  email: "",
  name: "",
  surname: "",
  roleId: 3,
  password: "",
};

const Users = () => {
  const { id: orgId } = useParams<{ id: string }>();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Add-user modal (invite or direct create)
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<UserFormMode>("invite");
  const [userForm, setUserForm] = useState<UserFormValues>(EMPTY_USER_FORM);
  const [emailStatus, setEmailStatus] = useState<EmailAvailabilityStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!orgId) return;
    try {
      const [userRes, inviteRes] = await Promise.all([
        getOrgUsers(parseInt(orgId)),
        getOrgInvitations(parseInt(orgId)),
      ]);
      setUsers(((userRes.data as any)?.data ?? []) as OrgUser[]);
      setInvitations(((inviteRes.data as any)?.data ?? []) as OrgInvitation[]);
    } catch (error) {
      console.error("Failed to fetch users/invitations:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.surname?.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.role_name?.toLowerCase().includes(term),
    );
  }, [users, searchTerm]);

  const canSubmitAdd = useMemo(() => {
    if (!userForm.name.trim()) return false;
    if (emailStatus !== "available") return false;
    if (addMode === "direct") {
      if (userForm.surname.trim().length < 2) return false;
      if (!passwordValidation(userForm.password).isValid) return false;
    }
    return true;
  }, [addMode, userForm, emailStatus]);

  const handleAddSubmit = async () => {
    if (!orgId || !canSubmitAdd) return;
    setSubmitting(true);
    setAddError("");
    try {
      const shared = {
        email: userForm.email.trim(),
        name: userForm.name.trim(),
        surname: userForm.surname.trim() || undefined,
        roleId: userForm.roleId,
      };
      if (addMode === "invite") {
        await inviteUserToOrg(parseInt(orgId), shared);
      } else {
        await createUserInOrg(parseInt(orgId), { ...shared, password: userForm.password });
      }
      setAddOpen(false);
      setUserForm(EMPTY_USER_FORM);
      setAddMode("invite");
      await fetchUsers();
    } catch (error: any) {
      setAddError(
        error?.message ||
          (addMode === "invite" ? "Failed to invite user" : "Failed to create user"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeUser(deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchUsers();
    } catch (error) {
      console.error("Failed to remove user:", error);
    } finally {
      setDeleting(false);
    }
  };

  const tableStyles = singleTheme.tableStyles.primary;

  return (
    <PageHeaderExtended
      title="Users"
      description={`Manage users for organization #${orgId}`}
      breadcrumbItems={[{ label: "Organizations", path: "/super-admin" }, { label: "Users" }]}
      actionButton={
        <Button
          variant="contained"
          disableElevation
          startIcon={<UserPlus size={14} />}
          onClick={() => setAddOpen(true)}
          sx={{
            textTransform: "none",
            height: 34,
            fontSize: "13px",
            borderRadius: "4px",
          }}
        >
          Add user
        </Button>
      }
    >
      {/* Search bar */}
      <Stack direction="row" alignItems="center" gap={1.5}>
        <SearchBox
          placeholder="Search users..."
          value={searchTerm}
          onChange={setSearchTerm}
          sx={{ maxWidth: 320 }}
        />
        <Typography sx={{ fontSize: "13px", color: "text.secondary", whiteSpace: "nowrap" }}>
          {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {/* Table */}
      {loading ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Loading users...</Typography>
        </Box>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          message={
            searchTerm
              ? `No users match "${searchTerm}"`
              : "No users in this organization. Invite one to get started."
          }
          icon={UsersIcon}
          showBorder
        />
      ) : (
        <TableContainer sx={{ ...tableStyles.frame }}>
          <Table>
            <TableHead>
              <TableRow sx={tableStyles.header.row}>
                <TableCell sx={tableStyles.header.cell}>Name</TableCell>
                <TableCell sx={tableStyles.header.cell}>Email</TableCell>
                <TableCell sx={tableStyles.header.cell}>Role</TableCell>
                <TableCell sx={tableStyles.header.cell}>Joined</TableCell>
                <TableCell sx={tableStyles.header.cell}>Last Login</TableCell>
                <TableCell sx={{ ...tableStyles.header.cell, textAlign: "right" }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => {
                const colors = ROLE_COLORS[user.role_name] || {
                  bg: "#f3f4f6",
                  text: "#6b7280",
                };
                return (
                  <TableRow key={user.id} sx={tableStyles.body.row}>
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
                      {displayFormattedDate(user.created_at)}
                    </TableCell>
                    <TableCell sx={tableStyles.body.cell}>
                      {user.last_login ? displayFormattedDate(user.last_login) : "Never"}
                    </TableCell>
                    <TableCell sx={{ ...tableStyles.body.cell, textAlign: "right" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setDeleteTarget(user);
                          setDeleteOpen(true);
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

      {/* Pending invitations */}
      {!loading && (
        <Stack sx={{ mt: 5 }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 600, color: "text.primary", mb: 2 }}>
            Pending invitations ({invitations.length})
          </Typography>
          <TableContainer sx={{ ...tableStyles.frame, overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow sx={tableStyles.header.row}>
                  <TableCell sx={tableStyles.header.cell}>Name</TableCell>
                  <TableCell sx={tableStyles.header.cell}>Email</TableCell>
                  <TableCell sx={tableStyles.header.cell}>Role</TableCell>
                  <TableCell sx={tableStyles.header.cell}>Sent</TableCell>
                  <TableCell sx={tableStyles.header.cell}>Expires</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      sx={{
                        ...tableStyles.body.cell,
                        textAlign: "center",
                        py: 4,
                        color: "text.secondary",
                        fontSize: 13,
                      }}
                    >
                      No pending invitations
                    </TableCell>
                  </TableRow>
                ) : (
                  invitations.map((inv) => {
                    const roleName = inv.role_name || "—";
                    const colors = ROLE_COLORS[roleName] || { bg: "#f3f4f6", text: "#6b7280" };
                    return (
                      <TableRow key={inv.id} sx={tableStyles.body.row}>
                        <TableCell sx={tableStyles.body.cell}>
                          <Typography sx={{ fontSize: 13 }}>
                            {inv.name}
                            {inv.surname ? ` ${inv.surname}` : ""}
                          </Typography>
                        </TableCell>
                        <TableCell sx={tableStyles.body.cell}>
                          <Typography sx={{ fontSize: 13 }}>{inv.email}</Typography>
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
                            {roleName}
                          </Box>
                        </TableCell>
                        <TableCell sx={tableStyles.body.cell}>
                          {displayFormattedDate(inv.created_at)}
                        </TableCell>
                        <TableCell sx={tableStyles.body.cell}>
                          {displayFormattedDate(inv.expires_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}

      {/* Add User Modal (invite or create directly) */}
      <StandardModal
        isOpen={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddError("");
          setUserForm(EMPTY_USER_FORM);
          setAddMode("invite");
        }}
        title="Add user"
        description={
          addMode === "invite"
            ? "Send an invitation to a new user"
            : "Create a user with a password you set"
        }
        submitButtonText={addMode === "invite" ? "Send invite" : "Create user"}
        onSubmit={handleAddSubmit}
        isSubmitting={submitting}
        isSubmitDisabled={!canSubmitAdd}
        maxWidth="480px"
      >
        <Stack spacing={2}>
          <UserFormFields
            mode={addMode}
            onModeChange={setAddMode}
            values={userForm}
            onChange={(patch) => setUserForm((prev) => ({ ...prev, ...patch }))}
            onEmailStatusChange={setEmailStatus}
          />
          {addError && <Typography sx={{ fontSize: 13, color: "#D32F2F" }}>{addError}</Typography>}
        </Stack>
      </StandardModal>

      {/* Remove User Modal */}
      <StandardModal
        isOpen={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        title="Remove User"
        description={`Remove "${deleteTarget?.name} ${deleteTarget?.surname}" from this organization?`}
        submitButtonText="Remove"
        onSubmit={handleRemove}
        isSubmitting={deleting}
        submitButtonColor="error"
        maxWidth="480px"
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          This will permanently remove the user and all their data from this organization.
        </Typography>
      </StandardModal>
    </PageHeaderExtended>
  );
};

export default Users;
