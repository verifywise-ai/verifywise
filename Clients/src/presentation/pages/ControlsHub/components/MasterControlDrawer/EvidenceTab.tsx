/**
 * Controls Hub — Master Control Drawer, Evidence tab.
 *
 * Evidence in VerifyWise attaches at the framework-row level (e.g., on a
 * specific ISO 42001 sub-clause or EU AI Act control), not on the master
 * control itself. The master's role is to unify status/owner/due-date
 * across mapped framework rows — propagation does not carry files.
 *
 * This tab therefore serves as a signpost: it explains the model and lists
 * the mapped framework rows so users know where to go to attach evidence.
 * Deep-linking into framework pages is a follow-up once we know the user's
 * navigation flow.
 */
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { Info } from "lucide-react";

import { useMasterControlMappings } from "../../../../../application/hooks/useMasterControls";
import type {
  Framework,
  MasterControlFrameworkMapping,
  MasterControlModel,
} from "../../../../../domain/models/Common/masterControl/masterControl.model";

const FRAMEWORK_LABELS: Record<Framework, string> = {
  eu_ai_act: "EU AI Act",
  iso_42001: "ISO 42001",
  iso_27001: "ISO 27001",
  nist_ai_rmf: "NIST AI RMF",
};

interface EvidenceTabProps {
  master: MasterControlModel;
}

export default function EvidenceTab({ master }: EvidenceTabProps) {
  const theme = useTheme();
  const { data: mappings, isLoading, error } = useMasterControlMappings(
    master.id ?? null
  );

  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ padding: 4 }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ fontSize: 13 }}>
        Failed to load mappings.
      </Alert>
    );
  }

  const rows = mappings ?? [];

  return (
    <Stack spacing={3}>
      <Alert
        severity="info"
        icon={<Info size={16} />}
        sx={{ fontSize: 13, alignItems: "flex-start" }}
      >
        Evidence attaches to individual framework requirements, not to the
        master control itself. Open a mapped requirement below to manage
        files, links, and sign-offs. Master-level updates to status, owner,
        and due date still propagate automatically.
      </Alert>

      <Box>
        <Typography fontSize={13} fontWeight={600}>
          Mapped framework requirements
        </Typography>
        <Typography
          fontSize={12}
          color={theme.palette.text.tertiary}
          sx={{ marginTop: 0.5 }}
        >
          {rows.length === 0
            ? "No mappings yet — add one from the Mappings tab to start linking evidence."
            : `${rows.length} requirement${rows.length === 1 ? "" : "s"} to visit for evidence.`}
        </Typography>
      </Box>

      {rows.length > 0 && (
        <Stack
          divider={
            <Box
              sx={{
                height: "1px",
                backgroundColor: theme.palette.border.light,
              }}
            />
          }
          sx={{
            border: `1px solid ${theme.palette.border.light}`,
            borderRadius: 1,
          }}
        >
          {rows.map((row) => (
            <MappingEvidenceRow key={row.id} mapping={row} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function MappingEvidenceRow({
  mapping,
}: {
  mapping: MasterControlFrameworkMapping;
}) {
  const theme = useTheme();
  return (
    <Stack sx={{ padding: "10px 14px" }}>
      <Typography fontSize={11} color={theme.palette.text.tertiary}>
        {FRAMEWORK_LABELS[mapping.framework]}
      </Typography>
      <Typography fontSize={13} fontWeight={500} sx={{ marginTop: 0.25 }}>
        {mapping.framework_entity_code ??
          `${mapping.framework_entity_type} #${mapping.framework_entity_id}`}
      </Typography>
      {mapping.framework_entity_title && (
        <Typography
          fontSize={12}
          color={theme.palette.text.tertiary}
          sx={{ marginTop: 0.25 }}
        >
          {mapping.framework_entity_title}
        </Typography>
      )}
    </Stack>
  );
}
