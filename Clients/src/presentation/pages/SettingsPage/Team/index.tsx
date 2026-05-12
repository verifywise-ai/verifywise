import React, { useState, useCallback, useMemo, lazy, Suspense, useEffect, type JSX } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  IconButton,
  Stack,
  useTheme,
  SelectChangeEvent,
  TablePagination,
  TableFooter,
} from "@mui/material";
import {
  UserPlus as GroupsIcon,
  ChevronsUpDown,
  Trash2 as DeleteIconGrey,
  ChevronUp,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { ReactComponent as SelectorVertical } from "../../../assets/icons/selector-vertical.svg";
import TablePaginationActions from "../../../components/TablePagination";
import InviteUserModal from "../../../components/Modals/InviteUser";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { ButtonToggle } from "../../../components/button-toggle";
import singleTheme from "../../../themes/v1SingleTheme";
import { useRoles } from "../../../../application/hooks/useRoles";
import { deleteUserById, updateUserById } from "../../../../application/repository/user.repository";
import useUsers from "../../../../application/hooks/useUsers";
import { useAuth } from "../../../../application/hooks/useAuth";
import { UserModel } from "../../../../domain/models/Common/user/user.model";
import useInvitations from "../../../../application/hooks/useInvitations";
import {
  revokeInvitation,
  resendInvitation,
} from "../../../../application/repository/invitation.repository";
import Chip from "../../../components/Chip";
import { formatRelativeDate } from "../../../../application/utils/dateFormatter";

interface AlertState {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
  isToast?: boolean;
}
const Alert = lazy(() => import("../../../components/Alert"));

// Constants for roles

const TABLE_COLUMNS = [
  { id: "name", label: "NAME" },
  { id: "email", label: "EMAIL" },
  { id: "role", label: "ROLE" },
  { id: "action", label: "ACTION" },
];

const INVITATION_TABLE_COLUMNS = [
  { id: "name", label: "NAME" },
  { id: "email", label: "EMAIL" },
  { id: "role", label: "ROLE" },
  { id: "sent", label: "SENT" },
  { id: "status", label: "STATUS" },
  { id: "actions", label: "ACTIONS" },
];

const TEAM_TABLE_SORTING_KEY = "verifywise_team_table_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

/**
 * A component that renders a team management table with the ability to edit member roles, invite new members, and delete members.
 *
 * @component
 * @returns {JSX.Element} The rendered team management table.
 */
const TeamManagement: React.FC = (): JSX.Element => {
  const theme = useTheme();
  const { roles, loading: rolesLoading } = useRoles();

  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = useCallback((variant: AlertState["variant"], title: string, body: string) => {
    setAlert({ variant, title, body, isToast: false });
  }, []);

  // Auto-hide alert after 3 seconds
  React.useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  const roleItems = useMemo(
    () => roles.map((role) => ({ _id: role.id, name: role.name })),
    [roles],
  );

  // State management
  const [open, setOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<number | null>(null);
  const [filter, setFilter] = useState("0");

  const [page, setPage] = useState(0); // Current page
  const { userId } = useAuth();
  const { users, refreshUsers } = useUsers();
  const { invitations, refreshInvitations } = useInvitations();

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(TEAM_TABLE_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(TEAM_TABLE_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Exclude the current user from the team users list
  const teamUsers = users;

  const [rowsPerPage, setRowsPerPage] = useState(5); // Rows per page
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);

  const handleUpdateRole = useCallback(
    async (memberId: string, newRole: string) => {
      try {
        // Find the member to get their current data
        const member = teamUsers.find((user) => user.id.toString() === memberId);
        if (!member) {
          showAlert("error", "Error", "User not found.");
          return;
        }

        const updatedUser = UserModel.createNewUser({
          id: parseInt(memberId),
          name: member.name,
          surname: member.surname,
          email: member.email,
          roleId: parseInt(newRole),
        } as UserModel);

        const response = await updateUserById({
          userId: parseInt(memberId),
          userData: {
            name: updatedUser.name,
            surname: updatedUser.surname,
            email: updatedUser.email,
            roleId: updatedUser.roleId,
          },
        });

        if (response.status === 202) {
          showAlert("success", "Success", "User role updated successfully.");

          // Add a small delay to ensure the server has processed the update
          setTimeout(() => {
            refreshUsers();
          }, 500);
        } else {
          showAlert("error", "Error", (response as any)?.data?.message || "An error occurred.");
        }
      } catch (error) {
        showAlert(
          "error",
          "Error",
          `An error occurred: ${(error as Error).message || "Please try again."}`,
        );
      }
    },
    [teamUsers, refreshUsers, showAlert],
  );

  const handleClose = () => {
    setOpen(false);
    setMemberToDelete(null);
  };

  const confirmDelete = async () => {
    if (!memberToDelete) return;

    const memberId = Number(memberToDelete);

    try {
      const response = await deleteUserById({
        userId: memberId,
      });

      if (response && response.status === 202) {
        showAlert("success", "Success", "User deleted successfully");
        refreshUsers();
      } else if (response && response.status === 403) {
        // Demo user cannot be deleted - show info message
        showAlert("info", "Info", response.data?.message || "This user cannot be deleted");
      } else {
        showAlert("error", "Error", "User deletion failed");
      }
    } catch (error) {
      showAlert(
        "error",
        "Error",
        `An error occurred: ${(error as Error).message || "Please try again."}`,
      );
    }

    handleClose();
  };

  // Handle role change
  const handleRoleChange = useCallback(
    (event: SelectChangeEvent<string>, memberId: string) => {
      const newRole = event.target.value;
      handleUpdateRole(memberId, newRole);
    },
    [handleUpdateRole],
  );

  // Typography component for role display
  const RoleTypography = useMemo(() => {
    return ({ children }: { children: React.ReactNode }) => (
      <Typography
        sx={{
          fontSize: "13px",
          fontFamily: "Inter, sans-serif",
          color: "text.secondary",
        }}
      >
        {children}
      </Typography>
    );
  }, []);

  // Role value renderer
  const renderRoleValue = useCallback(
    (value: string) => {
      const roleId = value?.toString() || "1";
      const selectedRole = roles.find((r) => r.id.toString() === roleId);
      return <RoleTypography>{selectedRole?.name || "Admin"}</RoleTypography>;
    },
    [roles, RoleTypography],
  );

  // Sorting handlers
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        // Toggle direction if same column, or clear if already descending
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      // New column or first sort
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort the team data based on current sort configuration
  const sortedTeamUsers = useMemo(() => {
    if (!teamUsers || !sortConfig.key || !sortConfig.direction) {
      return teamUsers || [];
    }

    const sortableData = [...teamUsers];

    return sortableData.sort((a: any, b: any) => {
      let aValue: string;
      let bValue: string;

      // Use exact column name matching - case insensitive
      const sortKey = sortConfig.key.trim().toLowerCase();

      // Handle different column types for team members
      if (sortKey.includes("name")) {
        const aFullName = [a.name, a.surname].filter(Boolean).join(" ").toLowerCase();
        const bFullName = [b.name, b.surname].filter(Boolean).join(" ").toLowerCase();
        aValue = aFullName;
        bValue = bFullName;
      } else if (sortKey.includes("email")) {
        aValue = a.email?.toLowerCase() || "";
        bValue = b.email?.toLowerCase() || "";
      } else if (sortKey.includes("role")) {
        // Get role names for sorting
        const aRole = roles.find((r) => r.id.toString() === a.roleId?.toString());
        const bRole = roles.find((r) => r.id.toString() === b.roleId?.toString());
        aValue = aRole?.name?.toLowerCase() || "";
        bValue = bRole?.name?.toLowerCase() || "";
      } else {
        // Try to handle unknown columns by checking if they're properties of the member
        if (sortKey && sortKey in a && sortKey in b) {
          const aVal = (a as Record<string, unknown>)[sortKey];
          const bVal = (b as Record<string, unknown>)[sortKey];
          aValue = String(aVal).toLowerCase();
          bValue = String(bVal).toLowerCase();
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === "asc" ? comparison : -comparison;
        }
        return 0;
      }

      // Handle string comparisons
      const comparison = aValue.localeCompare(bValue);
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [teamUsers, sortConfig, roles]);

  // Filtered team members based on selected role
  const filteredMembers = useMemo(() => {
    const members = sortedTeamUsers.length > 0 ? sortedTeamUsers : teamUsers;
    return filter === "0"
      ? members
      : members.filter((member) => member.roleId === parseInt(filter));
  }, [filter, teamUsers, sortedTeamUsers]);

  const handleDeleteClick = (memberId: number) => {
    setMemberToDelete(memberId);
    setOpen(true);
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const inviteTeamMember = () => {
    setInviteUserModalOpen(true);
  };

  const handleResendInvitation = async (id: number) => {
    try {
      const response = await resendInvitation(id);
      if (response.status === 200) {
        showAlert("success", "Success", "Invitation resent successfully.");
      } else if (response.status === 206) {
        showAlert("info", "Info", "Email service unavailable. A fallback link was generated.");
      } else {
        showAlert("error", "Error", "Failed to resend invitation.");
      }
      refreshInvitations();
    } catch (error) {
      showAlert(
        "error",
        "Error",
        `Failed to resend invitation: ${(error as Error).message || "Please try again."}`,
      );
    }
  };

  const handleRevokeInvitation = async (id: number) => {
    try {
      const response = await revokeInvitation(id);
      if (response.status === 200) {
        showAlert("success", "Success", "Invitation revoked.");
      } else {
        showAlert("error", "Error", "Failed to revoke invitation.");
      }
      refreshInvitations();
    } catch (error) {
      showAlert(
        "error",
        "Error",
        `Failed to revoke invitation: ${(error as Error).message || "Please try again."}`,
      );
    }
  };

  const handleInvitation = (
    email: string,
    status: number | string,
    link: string | undefined = undefined,
  ) => {
    if (status === 200) {
      showAlert(
        "success",
        "Success",
        `Invitation sent to ${email}. Please ask them to check their email and follow the link to create an account.`,
      );
    } else if (status === 206) {
      showAlert(
        "info",
        "Info",
        `Invitation sent to ${email}. Please use this link: ${link} to create an account.`,
      );
    } else {
      showAlert("error", "Error", `Failed to send invitation to ${email}. Please try again.`);
    }

    setInviteUserModalOpen(false);
    refreshInvitations();
  };

  return (
    <Stack sx={{ mt: 3 }}>
      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
          <Box>
            <Alert
              variant={alert.variant}
              title={alert.title}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Box>
        </Suspense>
      )}

      <Box sx={{ mb: 4, maxWidth: theme.spacing(480) }}>
        <Typography
          variant="h4"
          gutterBottom
          sx={{
            flexGrow: 1,
            top: theme.spacing(2.5),
            fontSize: "13px",
            fontWeight: 600,
            color: "text.primary",
            pt: theme.spacing(20),
          }}
        >
          Team members
        </Typography>
        <Stack sx={{ maxWidth: theme.spacing(480) }}>
          <Stack
            sx={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              mb: 3,
            }}
          >
            {rolesLoading ? (
              <Typography>Loading roles...</Typography>
            ) : (
              <ButtonToggle
                options={[
                  { value: "0", label: "All", count: teamUsers.length },
                  ...roleItems.map((role) => ({
                    value: role._id.toString(),
                    label: role.name,
                    count: teamUsers.filter((user) => user.roleId === role._id).length,
                  })),
                ]}
                value={filter}
                onChange={(value) => setFilter(value)}
                height={34}
              />
            )}

            <Box>
              <CustomizableButton
                variant="contained"
                text="Invite team member"
                sx={{
                  backgroundColor: "brand.primary",
                  border: "1px solid brand.primary",
                  gap: 2,
                }}
                icon={<GroupsIcon size={16} />}
                onClick={() => inviteTeamMember()}
              />
            </Box>
          </Stack>

          {/* only render table and pagination if team is loaded  */}
          {rolesLoading || roles.length === 0 ? null : (
            <>
              <TableContainer sx={{ overflowX: "auto", mt: 1 }}>
                <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
                  <TableHead
                    sx={{
                      backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                    }}
                  >
                    <TableRow>
                      {TABLE_COLUMNS.map((column) => {
                        const isLastColumn = column.id === "action";
                        const sortable = !["action"].includes(column.id);

                        return (
                          <TableCell
                            key={column.id}
                            sx={{
                              ...singleTheme.tableStyles.primary.header.cell,
                              ...(!isLastColumn && sortable
                                ? {
                                    "cursor": "pointer",
                                    "userSelect": "none",
                                    "&:hover": {
                                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                                    },
                                  }
                                : {}),
                            }}
                            onClick={() => sortable && handleSort(column.label)}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: theme.spacing(2),
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 500,
                                  color:
                                    sortConfig.key === column.label ? "primary.main" : "inherit",
                                  textTransform: "uppercase",
                                }}
                              >
                                {column.label}
                              </Typography>
                              {sortable && (
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    color:
                                      sortConfig.key === column.label
                                        ? "primary.main"
                                        : "text.disabled",
                                  }}
                                >
                                  {sortConfig.key === column.label &&
                                    sortConfig.direction === "asc" && <ChevronUp size={16} />}
                                  {sortConfig.key === column.label &&
                                    sortConfig.direction === "desc" && <ChevronDown size={16} />}
                                  {sortConfig.key !== column.label && <ChevronsUpDown size={16} />}
                                </Box>
                              )}
                            </Box>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMembers.length > 0 ? (
                      filteredMembers
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((member) => (
                          <TableRow key={member.id} sx={singleTheme.tableStyles.primary.body.row}>
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                backgroundColor:
                                  sortConfig.key && sortConfig.key.toLowerCase().includes("name")
                                    ? "#e8e8e8"
                                    : "#fafafa",
                              }}
                            >
                              {[member.name, member.surname].filter(Boolean).join(" ")}
                            </TableCell>
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                textTransform: "none",
                                backgroundColor:
                                  sortConfig.key && sortConfig.key.toLowerCase().includes("email")
                                    ? "background.surface"
                                    : "inherit",
                              }}
                            >
                              {member.email}
                            </TableCell>
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                backgroundColor:
                                  sortConfig.key && sortConfig.key.toLowerCase().includes("role")
                                    ? "background.surface"
                                    : "inherit",
                              }}
                            >
                              <Select
                                value={member.roleId?.toString() || "1"}
                                onChange={(e) => handleRoleChange(e, member.id.toString())}
                                size="small"
                                displayEmpty
                                renderValue={renderRoleValue}
                                sx={{
                                  "minWidth": "120px",
                                  "fontSize": "13px",
                                  "fontFamily": "Inter, sans-serif",
                                  "color": "text.secondary",
                                  "& .MuiOutlinedInput-notchedOutline": {
                                    border: "none",
                                  },
                                  "& .MuiSelect-select": {
                                    fontSize: "13px",
                                    fontFamily: "Inter, sans-serif",
                                    padding: "0",
                                  },
                                }}
                                disabled={member.id === userId}
                              >
                                {roles.map((role) => (
                                  <MenuItem
                                    key={role.id}
                                    value={role.id.toString()}
                                    sx={{
                                      fontSize: "13px",
                                      fontFamily: "Inter, sans-serif",
                                    }}
                                  >
                                    {role.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </TableCell>
                            <TableCell
                              sx={{
                                ...singleTheme.tableStyles.primary.body.cell,
                                minWidth: "50px",
                                backgroundColor:
                                  sortConfig.key && sortConfig.key.toLowerCase().includes("action")
                                    ? "background.surface"
                                    : "inherit",
                              }}
                            >
                              <IconButton
                                onClick={() => handleDeleteClick(member.id)}
                                disableRipple
                                disabled={member.id === userId}
                              >
                                <DeleteIconGrey size={16} />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <TableRow sx={singleTheme.tableStyles.primary.body.row}>
                        {TABLE_COLUMNS.map((column) => (
                          <TableCell key={column.id} sx={singleTheme.tableStyles.primary.body.cell}>
                            -
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TablePagination
                        count={filteredMembers.length}
                        page={page}
                        onPageChange={handleChangePage}
                        rowsPerPage={rowsPerPage}
                        rowsPerPageOptions={[5, 10, 15, 25]}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                        ActionsComponent={(props) => <TablePaginationActions {...props} />}
                        labelRowsPerPage="Rows per page"
                        labelDisplayedRows={({ page, count }) =>
                          `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
                        }
                        slotProps={{
                          select: {
                            MenuProps: {
                              keepMounted: true,
                              PaperProps: {
                                className: "pagination-dropdown",
                                sx: {
                                  mt: 0,
                                  mb: theme.spacing(2),
                                },
                              },
                              transformOrigin: {
                                vertical: "bottom",
                                horizontal: "left",
                              },
                              anchorOrigin: {
                                vertical: "top",
                                horizontal: "left",
                              },
                              sx: { mt: theme.spacing(-2) },
                            },
                            inputProps: { id: "pagination-dropdown" },
                            IconComponent: SelectorVertical,
                            sx: {
                              "ml": theme.spacing(4),
                              "mr": theme.spacing(12),
                              "minWidth": theme.spacing(20),
                              "textAlign": "left",
                              "&.Mui-focused > div": {
                                backgroundColor: theme.palette.background.main,
                              },
                            },
                          },
                        }}
                        sx={{
                          "mt": theme.spacing(6),
                          "color": theme.palette.text.secondary,
                          "& .MuiSelect-icon": {
                            width: "24px",
                            height: "fit-content",
                          },
                          "& .MuiSelect-select": {
                            width: theme.spacing(10),
                            border: `1px solid ${theme.palette.border.light}`,
                            padding: theme.spacing(4),
                          },
                        }}
                      />
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableContainer>

              {open && (
                <ConfirmationModal
                  title="Confirm delete"
                  body={
                    <Typography fontSize={13}>
                      Are you sure you want to delete your account? This action is permanent and
                      cannot be undone.
                    </Typography>
                  }
                  cancelText="Cancel"
                  proceedText="Delete"
                  onCancel={handleClose}
                  onProceed={confirmDelete}
                  proceedButtonColor="error"
                  proceedButtonVariant="contained"
                />
              )}
            </>
          )}
          <Box sx={{ mt: 5 }}>
            <Typography
              sx={{
                fontSize: "13px",
                fontWeight: 600,
                color: "text.primary",
                mb: 2,
              }}
            >
              Pending invitations ({invitations.length})
            </Typography>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
                <TableHead
                  sx={{
                    backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                  }}
                >
                  <TableRow>
                    {INVITATION_TABLE_COLUMNS.map((column) => (
                      <TableCell key={column.id} sx={singleTheme.tableStyles.primary.header.cell}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            textTransform: "uppercase",
                          }}
                        >
                          {column.label}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invitations.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={INVITATION_TABLE_COLUMNS.length}
                        align="center"
                        sx={{ py: 4 }}
                      >
                        No pending invitations
                      </TableCell>
                    </TableRow>
                  ) : (
                    invitations.map((inv) => {
                      const isExpired = new Date(inv.expires_at) <= new Date();
                      return (
                        <TableRow key={inv.id} sx={singleTheme.tableStyles.primary.body.row}>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                            {[inv.name, inv.surname].filter(Boolean).join(" ") || "-"}
                          </TableCell>
                          <TableCell
                            sx={{
                              ...singleTheme.tableStyles.primary.body.cell,
                              textTransform: "none",
                            }}
                          >
                            {inv.email}
                          </TableCell>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                            {inv.role_name || "-"}
                          </TableCell>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                            {formatRelativeDate(inv.created_at)}
                          </TableCell>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                            <Chip
                              label={isExpired ? "Expired" : "Pending"}
                              variant={isExpired ? "error" : "warning"}
                            />
                          </TableCell>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                            <Stack direction="row" spacing={1}>
                              <IconButton
                                onClick={() => handleResendInvitation(inv.id)}
                                disableRipple
                                size="small"
                                title="Resend invitation"
                              >
                                <RefreshCw size={16} />
                              </IconButton>
                              <IconButton
                                onClick={() => handleRevokeInvitation(inv.id)}
                                disableRipple
                                size="small"
                                title="Revoke invitation"
                              >
                                <DeleteIconGrey size={16} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 20 }} />
        </Stack>
      </Box>
      {inviteUserModalOpen && (
        <InviteUserModal
          isOpen={inviteUserModalOpen}
          setIsOpen={setInviteUserModalOpen}
          onSendInvite={handleInvitation}
        />
      )}
    </Stack>
  );
};

export default TeamManagement;
