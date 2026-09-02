import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { Crown, Trash2, UserPlus } from "lucide-react";
import {
  getAllUsers,
  grantSuperAdmin,
  listSuperAdmins,
  revokeSuperAdmin,
  GlobalUser,
  SuperAdminEntry,
} from "../../../../../application/repository/superAdmin.repository";
import StandardModal from "../../../../components/Modals/StandardModal";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import AutoCompleteField from "../../../../components/Inputs/Autocomplete";
import { EmptyState } from "../../../../components/EmptyState";
import singleTheme from "../../../../themes/v1SingleTheme";
import { useAuth } from "../../../../../application/hooks/useAuth";

interface ElectModalProps {
  isOpen: boolean;
  candidates: GlobalUser[];
  onClose: () => void;
  onElected: () => void;
}

const ElectModal = ({ isOpen, candidates, onClose, onElected }: ElectModalProps) => {
  const [selected, setSelected] = useState<GlobalUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!selected) {
      setError("Select a user to elect.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await grantSuperAdmin(selected.id);
      onClose();
      onElected();
    } catch (err: any) {
      setError(err?.response?.data?.data?.message || err?.message || "Failed to elect user.");
    } finally {
      setSubmitting(false);
    }
  };

  const noCandidates = candidates.length === 0;

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Elect a Super Admin"
      description="Grant an existing user cross-organization Super Admin capabilities. Their base organization role is unchanged."
      submitButtonText="Elect"
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      maxWidth="480px"
    >
      <Stack spacing={2}>
        <AutoCompleteField<GlobalUser>
          label="User"
          isRequired
          placeholder="Search by name or email"
          options={candidates}
          value={selected}
          onChange={(_e, value) => {
            setSelected(value);
            if (value) setError(null);
          }}
          disabled={noCandidates}
          getOptionLabel={(u) => `${u.name}${u.surname ? ` ${u.surname}` : ""} — ${u.email}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText={noCandidates ? "All users are already Super Admins" : "No matches"}
          renderOption={(props, option) => {
            const { key, ...rest } = props as any;
            return (
              <Box component="li" key={key} {...rest} sx={{ py: 1, px: 1.5 }}>
                <Stack spacing={0.25} sx={{ width: "100%" }}>
                  <Typography sx={{ fontSize: 13, color: "#1c2130", fontWeight: 500 }}>
                    {option.name}
                    {option.surname ? ` ${option.surname}` : ""}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "#666666" }}>
                    {option.email}
                    {option.organization_name ? ` · ${option.organization_name}` : ""}
                  </Typography>
                </Stack>
              </Box>
            );
          }}
          error={error ?? undefined}
        />
      </Stack>
    </StandardModal>
  );
};

interface RevokeModalProps {
  target: SuperAdminEntry | null;
  onClose: () => void;
  onRevoked: () => void;
}

const RevokeModal = ({ target, onClose, onRevoked }: RevokeModalProps) => {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      await revokeSuperAdmin(target.user_id);
      onClose();
      onRevoked();
    } catch (error) {
      console.error("Failed to revoke Super Admin:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StandardModal
      isOpen={!!target}
      onClose={onClose}
      title="Revoke Super Admin"
      description={`Remove Super Admin from "${target?.name} ${target?.surname || ""}"?`}
      submitButtonText="Revoke"
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      submitButtonColor="error"
      maxWidth="480px"
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        They will keep their normal organization role but lose cross-organization access.
      </Typography>
    </StandardModal>
  );
};

const SuperAdmins = () => {
  const theme = useTheme();
  const { userId } = useAuth();
  const [superAdmins, setSuperAdmins] = useState<SuperAdminEntry[]>([]);
  const [allUsers, setAllUsers] = useState<GlobalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [electOpen, setElectOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SuperAdminEntry | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [saRes, userRes] = await Promise.all([listSuperAdmins(), getAllUsers()]);
      setSuperAdmins(((saRes.data as any)?.data ?? []) as SuperAdminEntry[]);
      setAllUsers(((userRes.data as any)?.data ?? []) as GlobalUser[]);
    } catch (error) {
      console.error("Failed to load Super Admins:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const candidates = useMemo(() => {
    const takenIds = new Set(superAdmins.map((s) => s.user_id));
    return allUsers.filter((u) => !takenIds.has(u.id));
  }, [allUsers, superAdmins]);

  const tableStyles = singleTheme.tableStyles.primary;
  const isLastSuperAdmin = superAdmins.length === 1;

  return (
    <Stack sx={{ mt: 3 }}>
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 3,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.primary" }}>
            Super Admins
          </Typography>
          <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5 }}>
            Users with cross-organization Super Admin capabilities. Only Super Admins can elect
            others.
          </Typography>
        </Box>
        <CustomizableButton
          variant="contained"
          text="Elect Super Admin"
          icon={<UserPlus size={16} />}
          onClick={() => setElectOpen(true)}
          sx={{ backgroundColor: "brand.primary", border: "1px solid brand.primary", gap: 2 }}
        />
      </Stack>

      {loading ? (
        <Box sx={{ py: 6, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Loading…</Typography>
        </Box>
      ) : superAdmins.length === 0 ? (
        <EmptyState message="No Super Admins yet." icon={Crown} showBorder />
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={{ ...tableStyles.frame }}>
            <TableHead sx={{ backgroundColor: tableStyles.header.backgroundColors }}>
              <TableRow>
                {["Name", "Email", "Organization", "Base role", ""].map((label) => (
                  <TableCell
                    key={label || "actions"}
                    align={label === "" ? "right" : "left"}
                    sx={tableStyles.header.cell}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 500, textTransform: "uppercase", fontSize: 12 }}
                    >
                      {label}
                    </Typography>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {superAdmins.map((sa) => {
                const isSelf = sa.user_id === userId;
                const disabled = isLastSuperAdmin || isSelf;
                const title = isSelf
                  ? "You cannot revoke yourself"
                  : isLastSuperAdmin
                    ? "Cannot revoke the last Super Admin"
                    : "Revoke Super Admin";
                return (
                  <TableRow key={sa.user_id} sx={tableStyles.body.row}>
                    <TableCell sx={tableStyles.body.cell}>
                      {`${sa.name} ${sa.surname || ""}`.trim()}
                    </TableCell>
                    <TableCell sx={tableStyles.body.cell}>{sa.email}</TableCell>
                    <TableCell sx={tableStyles.body.cell}>{sa.organization_name || "—"}</TableCell>
                    <TableCell sx={tableStyles.body.cell}>{sa.role_name || "—"}</TableCell>
                    <TableCell sx={tableStyles.body.cell} align="right">
                      <IconButton
                        size="small"
                        disabled={disabled}
                        onClick={() => setRevokeTarget(sa)}
                        title={title}
                        sx={{ color: theme.palette.error.main }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ElectModal
        isOpen={electOpen}
        candidates={candidates}
        onClose={() => setElectOpen(false)}
        onElected={fetchData}
      />
      <RevokeModal
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onRevoked={fetchData}
      />
    </Stack>
  );
};

export default SuperAdmins;
