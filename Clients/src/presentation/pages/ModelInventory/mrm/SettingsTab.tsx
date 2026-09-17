import { ReactNode, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
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
} from "@mui/material";
import { Rss, Layers, SlidersHorizontal, Bell, Users, Archive } from "lucide-react";
import SectionNav, { SectionNavItem } from "../../../components/SectionNav";
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
import RetentionSection from "./RetentionSection";
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

type SettingsSection =
  | "metrics-feed"
  | "tiering-rules"
  | "default-thresholds"
  | "alerts"
  | "roles"
  | "retention";

const MRM_SETTINGS_BASE_PATH = "/model-inventory/model-risk-management/settings";

// The URL slug and the internal section key differ only for thresholds, where
// the URL uses the shorter "thresholds".
const SECTION_ITEMS: { key: SettingsSection; slug: string; label: string; icon: ReactNode }[] = [
  {
    key: "metrics-feed",
    slug: "metrics-feed",
    label: "Metrics feed & tokens",
    icon: <Rss size={16} strokeWidth={1.5} />,
  },
  {
    key: "tiering-rules",
    slug: "tiering-rules",
    label: "Tiering rules",
    icon: <Layers size={16} strokeWidth={1.5} />,
  },
  {
    key: "default-thresholds",
    slug: "thresholds",
    label: "Default thresholds",
    icon: <SlidersHorizontal size={16} strokeWidth={1.5} />,
  },
  {
    key: "alerts",
    slug: "alerts",
    label: "Alerts & notifications",
    icon: <Bell size={16} strokeWidth={1.5} />,
  },
  {
    key: "roles",
    slug: "roles",
    label: "Roles & independence",
    icon: <Users size={16} strokeWidth={1.5} />,
  },
  {
    key: "retention",
    slug: "retention",
    label: "Data retention",
    icon: <Archive size={16} strokeWidth={1.5} />,
  },
];

const DEFAULT_SECTION = SECTION_ITEMS[0];

const sectionFromSlug = (slug: string | undefined): (typeof SECTION_ITEMS)[number] =>
  SECTION_ITEMS.find((item) => item.slug === slug) ?? DEFAULT_SECTION;

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
  // Do NOT default to `= []` here: when the query is disabled (no model
  // selected) `data` is undefined, and an inline `= []` would produce a fresh
  // array reference on every render. That new reference would retrigger the
  // effect below, which calls setAssignments, causing an infinite render loop.
  // Keeping `roles` as React Query's stable `data` avoids that.
  const { data: roles } = useModelRoles(modelId === "" ? null : Number(modelId));
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
    (roles ?? []).forEach((r) => {
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
  const { settingsSection } = useParams<{ settingsSection?: string }>();

  // The active section is driven by the URL slug; an absent or unrecognised
  // slug falls back to the first section.
  const active = sectionFromSlug(settingsSection);
  const section: SettingsSection = active.key;

  const navItems: SectionNavItem[] = SECTION_ITEMS.map((item) => ({
    id: item.key,
    label: item.label,
    icon: item.icon,
  }));

  const slugForKey = (key: string) =>
    SECTION_ITEMS.find((item) => item.key === key)?.slug ?? DEFAULT_SECTION.slug;

  return (
    <Stack direction="row" sx={{ gap: "48px", alignItems: "flex-start" }}>
      <SectionNav
        items={navItems}
        activeId={section}
        ariaLabel="Settings sections"
        getHref={(key) => `${MRM_SETTINGS_BASE_PATH}/${slugForKey(key)}`}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {section === "metrics-feed" && (
          <MetricsFeedSection onError={onError} onSuccess={onSuccess} />
        )}
        {section === "tiering-rules" && <TieringRulesSection />}
        {section === "default-thresholds" && (
          <DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />
        )}
        {section === "alerts" && (
          <AlertsSection users={users} onError={onError} onSuccess={onSuccess} />
        )}
        {section === "roles" && (
          <RolesSection users={users} onError={onError} onSuccess={onSuccess} />
        )}
        {section === "retention" && <RetentionSection onError={onError} onSuccess={onSuccess} />}
      </Box>
    </Stack>
  );
};

export default SettingsTab;
