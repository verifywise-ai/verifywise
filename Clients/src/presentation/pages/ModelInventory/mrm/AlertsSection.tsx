import { useMemo, useState } from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Select from "../../../components/Inputs/Select";
import { EmptyState } from "../../../components/EmptyState";
import { MrmModelRole } from "../../../../domain/enums/mrm.enum";
import { useFleetTiering, useModelRoles } from "../../../../application/hooks/useMrm";
import { MrmUser } from "./types";
import { fleetModelName, ROLE_DEFINITIONS } from "./constants";
import {
  mrmCaptionStyle,
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
} from "./mrmStyles";

interface AlertsSectionProps {
  users: MrmUser[];
}

/**
 * Alerts & notifications is intentionally descriptive, not a config form.
 *
 * The backend has no alert-configuration persistence: on a breach it notifies the
 * humans assigned to the model's MRM roles automatically. There is no endpoint for
 * recipients, channels or an "auto-open a finding" switch — so this section reflects
 * the ACTUAL behaviour (who gets notified = the model's roles) rather than inventing
 * controls that would not persist. Recipients are changed on Roles & independence.
 */
const AlertsSection = ({ users }: AlertsSectionProps) => {
  const { data: fleet = [] } = useFleetTiering();
  const [modelId, setModelId] = useState<number | "">("");
  const { data: roles = [] } = useModelRoles(modelId === "" ? null : Number(modelId));

  const userName = useMemo(() => {
    const byId = new Map(
      users.map((u) => [Number(u.id), [u.name, u.surname].filter(Boolean).join(" ").trim()]),
    );
    return (id: number | null | undefined) =>
      id != null ? byId.get(Number(id)) || "—" : "Unassigned";
  }, [users]);

  const roleUserId = (role: MrmModelRole): number | null =>
    roles.find((r) => r.role === role)?.user_id ?? null;

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Who hears about a breach. When an ingested metric breaches its threshold, VerifyWise
        notifies the people assigned to the model&apos;s MRM roles — no separate recipient list to
        keep in sync. Change who is notified by reassigning roles on Roles &amp; independence.
      </Typography>

      <Box sx={{ maxWidth: "360px", marginBottom: "24px" }}>
        <Select
          id="mrm-alerts-model"
          label="Model"
          placeholder="Select a model"
          value={modelId}
          items={fleet.map((row) => ({ _id: row.id, name: fleetModelName(row) }))}
          onChange={(e) => setModelId(Number(e.target.value))}
        />
      </Box>

      {modelId === "" ? (
        <EmptyState message="Select a model to see who is notified of its breaches." />
      ) : (
        <>
          <TableContainer sx={mrmTableContainerStyle}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={mrmTableHeadCellStyle}>Role</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Notified on breach</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Assigned to</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ROLE_DEFINITIONS.map((def) => (
                  <TableRow key={def.role}>
                    <TableCell sx={mrmTableCellStyle}>{def.label}</TableCell>
                    <TableCell sx={mrmTableCellStyle}>Yes, in-app</TableCell>
                    <TableCell sx={mrmTableCellStyle}>{userName(roleUserId(def.role))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography sx={{ ...mrmCaptionStyle, marginTop: "12px" }}>
            Notifications are delivered in-app. A threshold set to notify and flag for revalidation
            also marks the model as due for a fresh validation. These behaviours are automatic —
            there is no separate alert configuration to maintain.
          </Typography>
        </>
      )}
    </Box>
  );
};

export default AlertsSection;
