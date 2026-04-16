/**
 * Controls Hub — Master Control Drawer, Mappings tab.
 *
 * Lists every framework mapping attached to a master control, grouped by
 * framework. Users remove a mapping by clicking its trash icon; adding a
 * new mapping is handled by the inline form (T-030 commit 2).
 *
 * The server enforces uniqueness on (master_control_id, framework,
 * framework_entity_type, framework_entity_id), so we rely on the list
 * refetch after mutations rather than trying to dedupe in the UI.
 */
import { useMemo } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Trash2 } from "lucide-react";

import {
  useMasterControlMappings,
  useMasterControlMutations,
} from "../../../../../application/hooks/useMasterControls";
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

const FRAMEWORK_ORDER: Framework[] = [
  "eu_ai_act",
  "iso_42001",
  "iso_27001",
  "nist_ai_rmf",
];

interface MappingsTabProps {
  master: MasterControlModel;
}

export default function MappingsTab({ master }: MappingsTabProps) {
  const theme = useTheme();
  const { data: mappings, isLoading, error } = useMasterControlMappings(
    master.id ?? null
  );
  const { removeMapping } = useMasterControlMutations();

  const grouped = useMemo(() => {
    const bucket = new Map<Framework, MasterControlFrameworkMapping[]>();
    (mappings ?? []).forEach((m) => {
      const list = bucket.get(m.framework) ?? [];
      list.push(m);
      bucket.set(m.framework, list);
    });
    return bucket;
  }, [mappings]);

  const handleDelete = (mapping: MasterControlFrameworkMapping) => {
    if (!mapping.id || !master.id) return;
    removeMapping.mutate({ mappingId: mapping.id, masterId: master.id });
  };

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

  const total = mappings?.length ?? 0;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography fontSize={13} fontWeight={600}>
          Framework mappings
        </Typography>
        <Typography
          fontSize={12}
          color={theme.palette.text.tertiary}
          sx={{ marginTop: 0.5 }}
        >
          {total === 0
            ? "No mappings yet — add the first one below."
            : `${total} mapping${total === 1 ? "" : "s"} across ${grouped.size} framework${grouped.size === 1 ? "" : "s"}.`}
        </Typography>
      </Box>

      {FRAMEWORK_ORDER.map((framework) => {
        const rows = grouped.get(framework);
        if (!rows || rows.length === 0) return null;
        return (
          <Stack key={framework} spacing={1}>
            <Typography
              fontSize={11}
              fontWeight={600}
              sx={{
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: theme.palette.text.tertiary,
              }}
            >
              {FRAMEWORK_LABELS[framework]}
            </Typography>
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
                <MappingRow
                  key={row.id ?? `${row.framework_entity_type}-${row.framework_entity_id}`}
                  mapping={row}
                  onDelete={handleDelete}
                  disabled={master.is_demo || removeMapping.isPending}
                />
              ))}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}

interface MappingRowProps {
  mapping: MasterControlFrameworkMapping;
  onDelete: (m: MasterControlFrameworkMapping) => void;
  disabled: boolean;
}

function MappingRow({ mapping, onDelete, disabled }: MappingRowProps) {
  const theme = useTheme();
  const primary =
    mapping.framework_entity_code ??
    `${mapping.framework_entity_type} #${mapping.framework_entity_id}`;
  const secondary = mapping.framework_entity_title;

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ padding: "10px 14px" }}
    >
      <Stack>
        <Typography fontSize={13} fontWeight={500}>
          {primary}
        </Typography>
        {secondary && (
          <Typography
            fontSize={12}
            color={theme.palette.text.tertiary}
            sx={{ marginTop: 0.25 }}
          >
            {secondary}
          </Typography>
        )}
        <Typography
          fontSize={11}
          color={theme.palette.text.tertiary}
          sx={{ marginTop: 0.25, fontStyle: "italic" }}
        >
          {mapping.framework_entity_type}
        </Typography>
      </Stack>
      <Tooltip title={disabled ? "Cannot modify" : "Remove mapping"}>
        <span>
          <IconButton
            size="small"
            onClick={() => onDelete(mapping)}
            disabled={disabled}
            aria-label={`Remove mapping ${primary}`}
          >
            <Trash2 size={16} color={theme.palette.status.error.text} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
