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
import { Trash2, UserPlus, Users as UsersIcon, Mail } from "lucide-react";
import {
  getOrgUsers,
  inviteUserToOrg,
  removeUser,
  OrgUser,
} from "../../../../application/repository/superAdmin.repository";
import { useParams } from "react-router-dom";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import SearchBox from "../../../components/Search/SearchBox";
import { EmptyState } from "../../../components/EmptyState";
import singleTheme from "../../../themes/v1SingleTheme";

const Users = () => {
  const { id: orgId } = useParams<{ id: string }>();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteSurname, setInviteSurname] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState(3);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!orgId) return;
    try {
      const response = await getOrgUsers(parseInt(orgId));
      const serverData = response.data as any;
      setUsers(serverData?.data || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
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
        u.role_name?.toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  const handleInvite = async () => {
    if (!orgId || !inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    setInviteError("");
    try {
      await inviteUserToOrg(parseInt(orgId), {
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        surname: inviteSurname.trim() || undefined,
        roleId: inviteRoleId,
      });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteSurname("");
      setInviteRoleId(3);
      await fetchUsers();
    } catch (error: any) {
      setInviteError(error?.message || "Failed to invite user");
    } finally {
      setInviting(false);
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

  const roleOptions = [
    { value: 1, label: "Admin" },
    { value: 2, label: "Reviewer" },
    { value: 3, label: "Editor" },
    { value: 4, label: "Auditor" },
  ];

  const roleColors: Record<string, { bg: string; text: string }> = {
    Admin: { bg: "#eff6ff", text: "#2563eb" },
    Reviewer: { bg: "#faf5ff", text: "#9333ea" },
    Editor: { bg: "#f0fdf4", text: "#16a34a" },
    Auditor: { bg: "#fefce8", text: "#ca8a04" },
  };

  const tableStyles = singleTheme.tableStyles.primary;

  return (
    <PageHeaderExtended
      title="Users"
      description={`Manage users for organization #${orgId}`}
      breadcrumbItems={[
        { label: "Organizations", path: "/super-admin" },
        { label: "Users" },
      ]}
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
          Invite User
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
        <Typography
          sx={{ fontSize: "13px", color: "text.secondary", whiteSpace: "nowrap" }}
        >
          {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {/* Table */}
      {loading ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Loading users...
          </Typography>
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
                const colors = roleColors[user.role_name] || {
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
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <Mail size={13} color="#6b7280" />
                        <Typography sx={{ fontSize: 13 }}>{user.email}</Typography>
                      </Stack>
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
                    <TableCell sx={tableStyles.body.cell}>
                      {user.last_login
                        ? new Date(user.last_login).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "Never"}
                    </TableCell>
                    <TableCell sx={{ ...tableStyles.body.cell, textAlign: "right" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Trash2 size={13} />}
                        onClick={() => {
                          setDeleteTarget(user);
                          setDeleteOpen(true);
                        }}
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

      {/* Invite User Modal */}
      <StandardModal
        isOpen={inviteOpen}
        onClose={() => { setInviteOpen(false); setInviteError(""); }}
        title="Invite User"
        description="Send an invitation email to a new user"
        submitButtonText="Send Invite"
        onSubmit={handleInvite}
        isSubmitting={inviting}
        maxWidth="480px"
      >
        <Stack spacing={2}>
          <Field
            label="Email"
            isRequired
            placeholder="user@example.com"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            sx={{ width: "100%" }}
          />
          <Field
            label="First Name"
            isRequired
            placeholder="First name"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            sx={{ width: "100%" }}
          />
          <Field
            label="Last Name"
            placeholder="Last name"
            value={inviteSurname}
            onChange={(e) => setInviteSurname(e.target.value)}
            sx={{ width: "100%" }}
          />
          <Stack spacing={0.5}>
            <Typography variant="body2" fontWeight={500}>
              Role
            </Typography>
            <select
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(parseInt(e.target.value))}
              style={{
                height: 34,
                borderRadius: 4,
                border: "1px solid #d0d5dd",
                padding: "0 8px",
                fontSize: 13,
              }}
            >
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Stack>
          {inviteError && (
            <Typography sx={{ fontSize: 13, color: "#D32F2F" }}>
              {inviteError}
            </Typography>
          )}
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
