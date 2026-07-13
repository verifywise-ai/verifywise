import { useEffect, useMemo, useState } from "react";
import {
  Box,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Select from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import VerifyWiseMultiSelect from "../../../components/VerifyWiseMultiSelect";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import { MrmModelRole } from "../../../../domain/enums/mrm.enum";
import {
  useFleetTiering,
  useModelRoles,
  useMrmSettings,
  useUpdateMrmSettings,
} from "../../../../application/hooks/useMrm";
import { MrmUser } from "./types";
import { fleetModelName, mrmErrorMessage, ROLE_DEFINITIONS } from "./constants";
import {
  mrmCaptionStyle,
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
} from "./mrmStyles";

interface AlertsSectionProps {
  users: MrmUser[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const AlertsSection = ({ users, onError, onSuccess }: AlertsSectionProps) => {
  const { data: settings } = useMrmSettings();
  const updateSettings = useUpdateMrmSettings();
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [autoOpenFinding, setAutoOpenFinding] = useState(false);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);

  const { data: fleet = [] } = useFleetTiering();
  const [modelId, setModelId] = useState<number | "">("");
  const { data: roles = [] } = useModelRoles(modelId === "" ? null : Number(modelId));

  // Seed the form from the loaded settings; keep user edits afterwards.
  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.alert_email_enabled);
      setAutoOpenFinding(settings.breach_auto_open_finding);
      setRecipientIds(settings.alert_recipients.map(String));
    }
  }, [settings]);

  const recipientOptions = useMemo(
    () =>
      users.map((u) => ({
        value: String(u.id),
        label: [u.name, u.surname].filter(Boolean).join(" ").trim() || String(u.email ?? u.id),
      })),
    [users],
  );

  const userName = useMemo(() => {
    const byId = new Map(
      users.map((u) => [Number(u.id), [u.name, u.surname].filter(Boolean).join(" ").trim()]),
    );
    return (id: number | null | undefined) =>
      id != null ? byId.get(Number(id)) || "—" : "Unassigned";
  }, [users]);

  const roleUserId = (role: MrmModelRole): number | null =>
    roles.find((r) => r.role === role)?.user_id ?? null;

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        alert_email_enabled: emailEnabled,
        breach_auto_open_finding: autoOpenFinding,
        alert_recipients: recipientIds.map(Number),
      });
      onSuccess("Alert settings saved");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to save alert settings"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Who hears about a breach. When an ingested metric breaches its threshold, VerifyWise
        notifies the people assigned to the model&apos;s MRM roles, plus any additional recipients
        configured below. Email delivery and automatic findings are off until you enable them here.
      </Typography>

      <Box sx={{ maxWidth: "520px", marginBottom: "32px" }}>
        <Box sx={{ marginBottom: "16px" }}>
          <FormControlLabel
            control={
              <Toggle checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
            }
            label={<Typography sx={{ fontSize: "13px" }}>Send email alerts</Typography>}
          />
          <Typography sx={{ ...mrmCaptionStyle, marginLeft: "46px" }}>
            Applies to breach and overdue-validation alerts. In-app notifications are always on.
          </Typography>
        </Box>

        <Box sx={{ marginBottom: "16px" }}>
          <FormControlLabel
            control={
              <Toggle
                checked={autoOpenFinding}
                onChange={(e) => setAutoOpenFinding(e.target.checked)}
              />
            }
            label={
              <Typography sx={{ fontSize: "13px" }}>
                Automatically open a finding on hard breach
              </Typography>
            }
          />
          <Typography sx={{ ...mrmCaptionStyle, marginLeft: "46px" }}>
            One finding per model and metric while it stays open; warnings never open findings.
          </Typography>
        </Box>

        <Box sx={{ marginBottom: "16px" }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
            Additional recipients
          </Typography>
          <VerifyWiseMultiSelect
            options={recipientOptions}
            selectedValues={recipientIds}
            onChange={setRecipientIds}
            placeholder="Select users"
          />
          <Typography sx={{ ...mrmCaptionStyle, marginTop: "4px" }}>
            {"These people are alerted for every model, on top of the model's roles."}
          </Typography>
        </Box>

        <CustomizableButton
          variant="contained"
          text="Save alert settings"
          onClick={handleSave}
          isDisabled={updateSettings.isPending}
          testId="mrm-save-alerts-btn"
        />
      </Box>

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
                    <TableCell sx={mrmTableCellStyle}>Yes</TableCell>
                    <TableCell sx={mrmTableCellStyle}>{userName(roleUserId(def.role))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography sx={{ ...mrmCaptionStyle, marginTop: "12px" }}>
            Notifications are delivered in-app, and by email when email alerts are enabled. A
            threshold set to notify and flag for revalidation also marks the model as due for a
            fresh validation.
          </Typography>
        </>
      )}
    </Box>
  );
};

export default AlertsSection;
