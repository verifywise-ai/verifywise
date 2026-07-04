import { useEffect, useMemo, useState } from "react";
import {
  Box,
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
import { CustomizableButton } from "../../../components/button/customizable-button";
import Select from "../../../components/Inputs/Select";
import { EmptyState } from "../../../components/EmptyState";
import { MrmModelRole } from "../../../../domain/enums/mrm.enum";
import { IRoleAssignment } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";
import {
  useFleetTiering,
  useModelRoles,
  useSetModelRoles,
} from "../../../../application/hooks/useMrm";
import { fleetModelName, mrmErrorMessage, ROLE_DEFINITIONS } from "./constants";
import MetricsFeedSection from "./MetricsFeedSection";
import DefaultThresholdsSection from "./DefaultThresholdsSection";
import AlertsSection from "./AlertsSection";
import {
  mrmSectionIntroStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
} from "./mrmStyles";

interface SettingsTabProps {
  users: MrmUser[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

type SettingsSection = "metrics-feed" | "tiering-rules" | "default-thresholds" | "alerts" | "roles";

const SECTION_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: "metrics-feed", label: "Metrics feed & tokens" },
  { key: "tiering-rules", label: "Tiering rules" },
  { key: "default-thresholds", label: "Default thresholds" },
  { key: "alerts", label: "Alerts & notifications" },
  { key: "roles", label: "Roles & independence" },
];

const TIERING_RULES = [
  {
    tier: "Tier 1",
    cadence: "Full independent validation + continuous monitoring · annual revalidation",
  },
  { tier: "Tier 2", cadence: "Standard validation + periodic monitoring · 18-month cycle" },
  { tier: "Tier 3", cadence: "Lightweight review · biennial revalidation" },
];

const RolesSection = ({ users, onError, onSuccess }: SettingsTabProps) => {
  const { data: fleet = [] } = useFleetTiering();
  const [modelId, setModelId] = useState<number | "">("");
  const { data: roles = [] } = useModelRoles(modelId === "" ? null : Number(modelId));
  const setRoles = useSetModelRoles();

  const [assignments, setAssignments] = useState<Record<MrmModelRole, number | "">>({
    [MrmModelRole.OWNER]: "",
    [MrmModelRole.DEVELOPER]: "",
    [MrmModelRole.VALIDATOR]: "",
    [MrmModelRole.APPROVER]: "",
  });

  useEffect(() => {
    const next: Record<MrmModelRole, number | ""> = {
      [MrmModelRole.OWNER]: "",
      [MrmModelRole.DEVELOPER]: "",
      [MrmModelRole.VALIDATOR]: "",
      [MrmModelRole.APPROVER]: "",
    };
    roles.forEach((r) => {
      if (r.user_id != null) next[r.role] = Number(r.user_id);
    });
    setAssignments(next);
  }, [roles, modelId]);

  const userItems = useMemo(
    () =>
      users.map((u) => ({
        _id: Number(u.id),
        name: u.name ?? "",
        surname: u.surname ?? "",
      })),
    [users],
  );

  const handleSave = async () => {
    if (!modelId) {
      onError("Select a model to assign roles.");
      return;
    }
    const developerId =
      assignments[MrmModelRole.DEVELOPER] !== ""
        ? Number(assignments[MrmModelRole.DEVELOPER])
        : null;
    const validatorId =
      assignments[MrmModelRole.VALIDATOR] !== ""
        ? Number(assignments[MrmModelRole.VALIDATOR])
        : null;
    if (developerId !== null && validatorId !== null && developerId === validatorId) {
      onError("The validator must be independent — they cannot also be the developer.");
      return;
    }
    const payload: IRoleAssignment[] = ROLE_DEFINITIONS.map((def) => ({
      role: def.role,
      user_id: assignments[def.role] === "" ? null : Number(assignments[def.role]),
    }));
    try {
      await setRoles.mutateAsync({ modelId: Number(modelId), assignments: payload });
      onSuccess("Roles saved");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to save roles"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Assign the people accountable for each model. The validator must be independent — they
        cannot also be the developer.
      </Typography>

      <Box sx={{ maxWidth: "360px", marginBottom: "24px" }}>
        <Select
          id="mrm-roles-model"
          label="Model"
          placeholder="Select a model"
          value={modelId}
          items={fleet.map((row) => ({ _id: row.id, name: fleetModelName(row) }))}
          onChange={(e) => setModelId(Number(e.target.value))}
        />
      </Box>

      {modelId === "" ? (
        <EmptyState message="Select a model to view and assign its roles." />
      ) : (
        <>
          <TableContainer sx={mrmTableContainerStyle}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={mrmTableHeadCellStyle}>Role</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>Does</TableCell>
                  <TableCell sx={mrmTableHeadCellStyle}>On this model</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ROLE_DEFINITIONS.map((def) => (
                  <TableRow key={def.role}>
                    <TableCell sx={mrmTableCellStyle}>{def.label}</TableCell>
                    <TableCell sx={mrmTableCellStyle}>{def.does}</TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      <Box sx={{ maxWidth: "260px" }}>
                        <Select
                          id={`mrm-role-${def.role}`}
                          placeholder="Unassigned"
                          value={assignments[def.role]}
                          items={userItems}
                          onChange={(e) =>
                            setAssignments((prev) => ({
                              ...prev,
                              [def.role]: Number(e.target.value),
                            }))
                          }
                        />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ marginTop: "16px" }}>
            <CustomizableButton
              variant="contained"
              text="Save roles"
              onClick={handleSave}
              isDisabled={setRoles.isPending}
              testId="mrm-save-roles-btn"
            />
          </Box>
        </>
      )}
    </Box>
  );
};

const TieringRulesSection = () => (
  <Box>
    <Typography sx={mrmSectionIntroStyle}>
      The tier drives revalidation cadence and the depth of oversight. Tier assignment is manual in
      this release — set each model&apos;s tier on the Tiering sub-tab.
    </Typography>

    <TableContainer sx={mrmTableContainerStyle}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={mrmTableHeadCellStyle}>Tier</TableCell>
            <TableCell sx={mrmTableHeadCellStyle}>
              Validation depth & revalidation cadence
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {TIERING_RULES.map((rule) => (
            <TableRow key={rule.tier}>
              <TableCell sx={mrmTableCellStyle}>{rule.tier}</TableCell>
              <TableCell sx={mrmTableCellStyle}>{rule.cadence}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </Box>
);

const SettingsTab = ({ users, onError, onSuccess }: SettingsTabProps) => {
  const theme = useTheme();
  const [section, setSection] = useState<SettingsSection>("metrics-feed");

  return (
    <Stack direction="row" sx={{ gap: "48px", alignItems: "flex-start" }}>
      <Box
        role="tablist"
        sx={{
          minWidth: "200px",
          border: `1px solid ${theme.palette.border.dark}`,
          borderRadius: "4px",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {SECTION_ITEMS.map((item) => (
          <Box
            key={item.key}
            role="tab"
            aria-selected={section === item.key}
            tabIndex={0}
            onClick={() => setSection(item.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSection(item.key);
            }}
            sx={{
              padding: "12px 16px",
              fontSize: "13px",
              cursor: "pointer",
              borderBottom: `1px solid ${theme.palette.border.light}`,
              backgroundColor: section === item.key ? "background.accent" : "transparent",
              color: section === item.key ? "primary.main" : "text.secondary",
              fontWeight: section === item.key ? 600 : 400,
            }}
          >
            {item.label}
          </Box>
        ))}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {section === "metrics-feed" && (
          <MetricsFeedSection onError={onError} onSuccess={onSuccess} />
        )}
        {section === "tiering-rules" && <TieringRulesSection />}
        {section === "default-thresholds" && (
          <DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />
        )}
        {section === "alerts" && <AlertsSection users={users} />}
        {section === "roles" && (
          <RolesSection users={users} onError={onError} onSuccess={onSuccess} />
        )}
      </Box>
    </Stack>
  );
};

export default SettingsTab;
