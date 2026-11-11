import React, { useEffect, useState } from "react";
import {
  Autocomplete,
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
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Pencil, Plus as PlusIcon, Trash2, Users } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { CustomizableButton } from "../../components/button/customizable-button";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import useUsers from "../../../application/hooks/useUsers";
import { useHasPermission } from "../../../application/hooks/useMyPermissions";
import {
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useGroups,
  useSetGroupMembers,
  useUpdateGroup,
} from "../../../application/hooks/useGroups";
import type { IGroup } from "../../../domain/interfaces/i.group";

const TABLE_COLUMNS = [
  { id: "name", label: "NAME" },
  { id: "description", label: "DESCRIPTION" },
  { id: "members", label: "MEMBERS" },
  { id: "actions", label: "" },
];

interface GroupFormState {
  name: string;
  description: string;
  memberIds: number[];
}

const emptyForm: GroupFormState = { name: "", description: "", memberIds: [] };

const sameIds = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

function extractErrorMessage(err: any): string {
  return (
    err?.response?.data?.error || err?.response?.data?.message || err?.message || "Operation failed"
  );
}

const GroupsPage: React.FC = () => {
  const theme = useTheme();
  const canManageGroups = useHasPermission("groups.manage", { fallbackToAdmin: true });

  const { data: groups, isLoading, isError } = useGroups();
  const { users } = useUsers();

  const [editing, setEditing] = useState<IGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<IGroup | null>(null);
  const [form, setForm] = useState<GroupFormState>(emptyForm);
  const [serverError, setServerError] = useState<string | null>(null);
  // True when a create succeeded but saving its members failed. The modal is
  // then switched to editing the new group, so a retry only re-sends members
  // instead of creating the group a second time.
  const [membersSaveFailed, setMembersSaveFailed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Members of the group being edited as loaded from the server, or null
  // until they arrive. Saving replaces the membership only when the selection
  // differs from this, so an edit can never wipe members it did not load.
  const [initialMemberIds, setInitialMemberIds] = useState<number[] | null>(null);

  const editingId = editing?.id ?? null;
  const {
    data: currentMembers,
    isLoading: membersLoading,
    isError: membersError,
  } = useGroupMembers(editingId);

  useEffect(() => {
    if (editingId === null || !currentMembers || initialMemberIds !== null) return;
    const ids = currentMembers.map((member) => Number(member.user_id));
    setInitialMemberIds(ids);
    setForm((prev) => ({ ...prev, memberIds: ids }));
  }, [editingId, currentMembers, initialMemberIds]);

  const createMutation = useCreateGroup();
  const updateMutation = useUpdateGroup();
  const deleteMutation = useDeleteGroup();
  const setMembersMutation = useSetGroupMembers();

  const openCreate = () => {
    setForm(emptyForm);
    setServerError(null);
    setMembersSaveFailed(false);
    setCreating(true);
  };

  const openEdit = (group: IGroup) => {
    setEditing(group);
    setServerError(null);
    setMembersSaveFailed(false);
    setInitialMemberIds(null);
    setForm({ name: group.name, description: group.description ?? "", memberIds: [] });
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setInitialMemberIds(null);
    setServerError(null);
    setMembersSaveFailed(false);
  };

  const membersReady = !editing || initialMemberIds !== null;

  const handleSubmit = async () => {
    setServerError(null);
    setMembersSaveFailed(false);
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          body: {
            name: form.name,
            description: form.description || null,
          },
        });
        if (initialMemberIds !== null && !sameIds(form.memberIds, initialMemberIds)) {
          await setMembersMutation.mutateAsync({ id: editing.id, userIds: form.memberIds });
        }
      } else {
        const created = await createMutation.mutateAsync({
          name: form.name,
          description: form.description || null,
        });
        if (form.memberIds.length > 0) {
          try {
            await setMembersMutation.mutateAsync({ id: created.id, userIds: form.memberIds });
          } catch (err) {
            // The group exists now. Edit it from here on so "Save" retries
            // only the members (the server has none yet) and never re-POSTs.
            setCreating(false);
            setEditing(created);
            setInitialMemberIds([]);
            setMembersSaveFailed(true);
            setServerError(extractErrorMessage(err));
            return;
          }
        }
      }
      closeModal();
    } catch (err) {
      setServerError(extractErrorMessage(err));
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending || setMembersMutation.isPending;

  return (
    <Stack className="vwhome" sx={{ gap: theme.spacing(8) }}>
      <PageHeaderExtended
        title="Groups"
        description="Create teams and grant them use-case access in one step. Members of a group attached to a use case can see and work on it."
        actionButton={
          canManageGroups ? (
            <CustomizableButton
              variant="contained"
              text="New group"
              icon={<PlusIcon size={16} />}
              onClick={openCreate}
              sx={{
                backgroundColor: "brand.primary",
                border: "1px solid brand.primary",
                gap: 2,
              }}
            />
          ) : undefined
        }
      />

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={20} />
        </Box>
      ) : isError ? (
        <Typography sx={{ fontSize: 13, color: theme.palette.error.main }}>
          Failed to load groups.
        </Typography>
      ) : !groups || groups.length === 0 ? (
        <Box
          sx={{
            p: 6,
            border: `1px dashed ${theme.palette.border.light}`,
            borderRadius: theme.shape.borderRadius,
            textAlign: "center",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            No groups yet. Create one to grant a whole team access to a use case.
          </Typography>
        </Box>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
            <TableHead
              sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}
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
              {groups.map((group) => (
                <TableRow key={group.id} sx={singleTheme.tableStyles.primary.body.row}>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{group.name}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {group.description ?? "—"}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Chip
                      icon={<Users size={12} />}
                      label={`${group.member_count ?? 0}`}
                      sx={{ fontSize: "11px", height: "20px", borderRadius: "4px" }}
                    />
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell} align="right">
                    {canManageGroups && (
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Edit group">
                          <IconButton
                            size="small"
                            disableRipple
                            onClick={() => openEdit(group)}
                            aria-label={`Edit ${group.name}`}
                          >
                            <Pencil size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete group">
                          <IconButton
                            size="small"
                            disableRipple
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDelete(group);
                            }}
                            aria-label={`Delete ${group.name}`}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {(creating || editing) && (
        <StandardModal
          isOpen
          onClose={closeModal}
          title={editing ? "Edit group" : "New group"}
          description="Groups bundle users so you can add a whole team to a use case in one step."
          onSubmit={handleSubmit}
          submitButtonText={editing ? "Save" : "Create"}
          isSubmitting={busy}
          maxWidth="640px"
        >
          <Stack spacing={6}>
            <Field
              label="Name"
              placeholder="e.g. Model risk team"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              isRequired
            />
            <Field
              label="Description"
              placeholder="What is this group responsible for?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Autocomplete
              multiple
              id="group-members-input"
              size="small"
              value={users.filter((user) => form.memberIds.includes(Number(user.id)))}
              options={users.map((user) => ({
                id: Number(user.id),
                name: user.name,
                surname: user.surname,
                email: user.email,
              }))}
              getOptionLabel={(member) => `${member.name} ${member.surname}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_event, selected) =>
                setForm({ ...form, memberIds: selected.map((member) => member.id) })
              }
              loading={!membersReady && !membersError}
              renderInput={(params) => <TextField {...params} placeholder="Select members" />}
              disabled={!canManageGroups || !membersReady}
            />
            {editing && membersLoading && (
              <Stack direction="row" sx={{ alignItems: "center", gap: "8px" }}>
                <CircularProgress size={14} />
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                  Loading members...
                </Typography>
              </Stack>
            )}
            {editing && membersError && (
              <Typography sx={{ fontSize: 13, color: theme.palette.error.main }}>
                Could not load this group's members. You can still save the name and description;
                members stay as they are.
              </Typography>
            )}
            {membersSaveFailed && (
              <Typography role="alert" sx={{ fontSize: 13, color: theme.palette.error.main }}>
                The group was created, but its members were not saved. Select Save to try again.
              </Typography>
            )}
            {serverError && (
              <Typography sx={{ fontSize: 12, color: theme.palette.error.main }}>
                {serverError}
              </Typography>
            )}
          </Stack>
        </StandardModal>
      )}

      {confirmDelete && (
        <ConfirmationModal
          isOpen
          title="Delete this group?"
          body={
            <Stack sx={{ gap: "8px" }}>
              <Typography sx={{ fontSize: 13 }}>
                {`When you delete "${confirmDelete.name}", its membership and use-case attachments are removed. Members keep any direct use-case access.`}
              </Typography>
              {deleteError && (
                <Typography role="alert" sx={{ fontSize: 13, color: theme.palette.error.main }}>
                  {deleteError}
                </Typography>
              )}
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Delete"
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          onCancel={() => {
            setConfirmDelete(null);
            setDeleteError(null);
          }}
          onProceed={async () => {
            setDeleteError(null);
            try {
              await deleteMutation.mutateAsync(confirmDelete.id);
              setConfirmDelete(null);
            } catch (err) {
              // Keep the dialog open and show why, instead of writing to the
              // create/edit modal's error that is not on screen.
              setDeleteError(extractErrorMessage(err));
            }
          }}
          isLoading={deleteMutation.isPending}
        />
      )}
    </Stack>
  );
};

export default GroupsPage;
