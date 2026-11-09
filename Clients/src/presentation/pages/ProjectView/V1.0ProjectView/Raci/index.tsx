import { useMemo, useState, type FC } from "react";
import {
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
import { UserPlus, Users as UsersIcon } from "lucide-react";
import Alert from "../../../../components/Alert";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import { EmptyState } from "../../../../components/EmptyState";
import CustomizableSkeleton from "../../../../components/Skeletons";
import { ExportMenu } from "../../../../components/Table/ExportMenu";
import VWTooltip from "../../../../components/VWTooltip";
import singleTheme from "../../../../themes/v1SingleTheme";
import allowedRoles from "../../../../../application/constants/permissions";
import { useAuth } from "../../../../../application/hooks/useAuth";
import { useRaci, useUpdateRaciRoles } from "../../../../../application/hooks/useRaci";
import type { RaciRow } from "../../../../../application/repository/raci.repository";
import { RaciRole, RaciSubjectType } from "../../../../../domain/enums/raci.enum";
import AddPersonModal from "./AddPersonModal";
import {
  RACI_EXPORT_COLUMNS,
  RACI_LEGEND,
  RACI_ROLE_NAMES,
  RACI_ROLES,
  RACI_SAVE_ERROR_MESSAGE,
  RACI_WARNING_MESSAGES,
  buildRaciExportRows,
  describeSources,
} from "./raci.constants";

interface RaciCellProps {
  row: RaciRow;
  role: RaciRole;
  isDisabled: boolean;
  onToggle: (row: RaciRow, role: RaciRole) => void;
}

const RaciCell: FC<RaciCellProps> = ({ row, role, isDisabled, onToggle }) => {
  const held = row.roles.find((entry) => entry.role === role);
  const button = (
    <span>
      <CustomizableButton
        variant={held ? "contained" : "outlined"}
        size="small"
        text={role}
        isDisabled={isDisabled}
        onClick={() => onToggle(row, role)}
        ariaLabel={RACI_ROLE_NAMES[role]}
        aria-pressed={Boolean(held)}
        testId={`button-raci-${role}-${row.subject_id ?? "external"}`}
        sx={{ height: "30px", minHeight: "30px", width: "30px", minWidth: "30px", padding: 0 }}
      />
    </span>
  );

  return held ? (
    <VWTooltip header={RACI_ROLE_NAMES[role]} content={describeSources(held.sources)}>
      {button}
    </VWTooltip>
  ) : (
    button
  );
};

interface RaciProps {
  projectId: number;
}

const Raci: FC<RaciProps> = ({ projectId }) => {
  const theme = useTheme();
  const { userRoleName } = useAuth();
  const canEdit = allowedRoles.projects.edit.includes(userRoleName);
  const { data, isLoading, refetch } = useRaci(projectId);
  const updateRoles = useUpdateRaciRoles(projectId);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const existingUserIds = useMemo(
    () =>
      rows
        .filter((row) => row.subject_type === RaciSubjectType.USER)
        .map((row) => row.subject_id as number),
    [rows],
  );

  const handleToggle = (row: RaciRow, role: RaciRole) => {
    if (row.subject_id === null) return;
    const isHeld = row.roles.some((entry) => entry.role === role);
    updateRoles.mutate({
      userId: row.subject_id,
      change: isHeld ? { remove: [role] } : { add: [role] },
    });
  };

  const handleAddPerson = (userId: number, roles: RaciRole[], onAdded: () => void) => {
    updateRoles.mutate({ userId, change: { add: roles } }, { onSuccess: onAdded });
  };

  // A save error belongs to the attempt that caused it, so opening or closing
  // the modal clears it.
  const setAddModalOpen = (isOpen: boolean) => {
    updateRoles.reset();
    setIsAddOpen(isOpen);
  };

  if (isLoading) {
    return (
      <Stack data-testid="raci-loading">
        <CustomizableSkeleton variant="rectangular" width="100%" height={300} />
      </Stack>
    );
  }

  // Only a first load with nothing to show is an error. A failed background
  // refetch keeps the loaded matrix and any open modal.
  if (!data) {
    return (
      <Stack sx={{ gap: "16px", alignItems: "center" }}>
        <EmptyState icon={UsersIcon} message="The RACI matrix could not be loaded." />
        <CustomizableButton
          variant="outlined"
          text="Try again"
          onClick={() => void refetch()}
          testId="button-raci-retry"
        />
      </Stack>
    );
  }

  const tableStyles = singleTheme.tableStyles.primary;
  const headerCell = { ...tableStyles.header.cell, textAlign: "center" as const };

  return (
    <Stack sx={{ gap: "16px" }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", gap: "16px" }}
      >
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: "4px 16px" }}>
          {RACI_ROLES.map((role) => (
            <Typography key={role} sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
              {RACI_LEGEND[role]}
            </Typography>
          ))}
        </Stack>
        <Stack direction="row" sx={{ gap: "8px", alignItems: "center", flexShrink: 0 }}>
          {canEdit && (
            <CustomizableButton
              variant="contained"
              text="Add person"
              startIcon={<UserPlus size={16} strokeWidth={1.5} />}
              onClick={() => setAddModalOpen(true)}
              testId="button-raci-add-person"
              sx={{ height: "30px", minHeight: "30px" }}
            />
          )}
          <ExportMenu
            data={buildRaciExportRows(rows)}
            columns={RACI_EXPORT_COLUMNS}
            filename={`raci-${projectId}`}
            title="RACI matrix"
          />
        </Stack>
      </Stack>

      {updateRoles.isError && !isAddOpen && (
        <Alert variant="error" body={RACI_SAVE_ERROR_MESSAGE} inline />
      )}

      {data.warnings.map((warning) => (
        <Alert key={warning} variant="warning" body={RACI_WARNING_MESSAGES[warning]} inline />
      ))}

      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} message="No one has a RACI role on this use case yet." />
      ) : (
        <TableContainer sx={tableStyles.frame}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ ...tableStyles.header.row, textTransform: "none" }}>
                <TableCell sx={tableStyles.header.cell}>Person</TableCell>
                {RACI_ROLES.map((role) => (
                  <TableCell key={role} sx={headerCell} title={RACI_ROLE_NAMES[role]}>
                    {role}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.subject_id ?? "external"}
                  data-testid={`raci-row-${row.subject_id ?? "external"}`}
                >
                  {/* The row header gives each role button its person for screen readers. */}
                  <TableCell component="th" scope="row">
                    <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
                      {row.name}
                    </Typography>
                    <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary }}>
                      {row.subject_type === RaciSubjectType.EXTERNAL ? "External owner" : row.email}
                    </Typography>
                  </TableCell>
                  {RACI_ROLES.map((role) => (
                    <TableCell key={role} align="center">
                      <RaciCell
                        row={row}
                        role={role}
                        isDisabled={!canEdit || !row.editable || updateRoles.isPending}
                        onToggle={handleToggle}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {canEdit && (
        <AddPersonModal
          isOpen={isAddOpen}
          isSubmitting={updateRoles.isPending}
          hasSaveError={updateRoles.isError}
          existingUserIds={existingUserIds}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddPerson}
        />
      )}
    </Stack>
  );
};

export default Raci;
