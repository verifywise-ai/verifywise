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
import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  SelectChangeEvent,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Plus, Trash2 } from "lucide-react";

import Field from "../../../../components/Inputs/Field";
import Select from "../../../../components/Inputs/Select";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import {
  useMasterControlMappings,
  useMasterControlMutations,
} from "../../../../../application/hooks/useMasterControls";
import type {
  Framework,
  FrameworkEntityType,
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

/**
 * Which `framework_entity_type` values are valid for each framework. Matches
 * the FrameworkEntityType union in the domain model; keeping the picker
 * honest prevents the server from rejecting a mismatched pair.
 */
const ENTITY_TYPES_BY_FRAMEWORK: Record<Framework, FrameworkEntityType[]> = {
  eu_ai_act: ["control_eu", "subcontrol_eu"],
  iso_42001: ["subclause_struct_iso", "annex_category_iso"],
  iso_27001: ["iso27001_subclause", "iso27001_annex_category"],
  nist_ai_rmf: ["subcategory_nist"],
};

const ENTITY_TYPE_LABELS: Record<FrameworkEntityType, string> = {
  control_eu: "Control",
  subcontrol_eu: "Sub-control",
  subclause_struct_iso: "Sub-clause",
  annex_category_iso: "Annex category",
  iso27001_subclause: "Sub-clause",
  iso27001_annex_category: "Annex control",
  subcategory_nist: "Sub-category",
};

interface MappingsTabProps {
  master: MasterControlModel;
}

export default function MappingsTab({ master }: MappingsTabProps) {
  const theme = useTheme();
  const { data: mappings, isLoading, error } = useMasterControlMappings(
    master.id ?? null
  );
  const { addMapping, removeMapping } = useMasterControlMutations();

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

      {!master.is_demo && master.id != null && (
        <AddMappingForm
          masterId={master.id}
          isPending={addMapping.isPending}
          onSubmit={async (payload) => {
            await addMapping.mutateAsync({ id: master.id!, body: payload });
          }}
        />
      )}
    </Stack>
  );
}

// ---------- Add-mapping form ----------

interface AddMappingFormProps {
  masterId: number;
  isPending: boolean;
  onSubmit: (payload: {
    framework: Framework;
    framework_entity_type: FrameworkEntityType;
    framework_entity_id: number;
  }) => Promise<void>;
}

function AddMappingForm({ masterId: _masterId, isPending, onSubmit }: AddMappingFormProps) {
  const theme = useTheme();
  const [framework, setFramework] = useState<Framework>("eu_ai_act");
  const [entityType, setEntityType] = useState<FrameworkEntityType>(
    ENTITY_TYPES_BY_FRAMEWORK.eu_ai_act[0]
  );
  const [entityIdRaw, setEntityIdRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const entityTypeOptions = useMemo(
    () =>
      ENTITY_TYPES_BY_FRAMEWORK[framework].map((t) => ({
        _id: t,
        name: ENTITY_TYPE_LABELS[t],
      })),
    [framework]
  );

  const frameworkOptions = FRAMEWORK_ORDER.map((f) => ({
    _id: f,
    name: FRAMEWORK_LABELS[f],
  }));

  const handleFrameworkChange = (event: SelectChangeEvent<string | number>) => {
    const next = event.target.value as Framework;
    setFramework(next);
    // Reset entity type to the first valid option for the new framework.
    setEntityType(ENTITY_TYPES_BY_FRAMEWORK[next][0]);
    setError(null);
  };

  const handleEntityTypeChange = (
    event: SelectChangeEvent<string | number>
  ) => {
    setEntityType(event.target.value as FrameworkEntityType);
    setError(null);
  };

  const reset = () => {
    setEntityIdRaw("");
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    const parsed = Number(entityIdRaw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      setError("Entity id must be a positive integer.");
      return;
    }

    try {
      await onSubmit({
        framework,
        framework_entity_type: entityType,
        framework_entity_id: parsed,
      });
      reset();
      setSuccess("Mapping added.");
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add mapping."
      );
    }
  };

  return (
    <Box
      sx={{
        marginTop: 2,
        padding: "16px",
        border: `1px dashed ${theme.palette.border.light}`,
        borderRadius: 1,
      }}
    >
      <Typography fontSize={13} fontWeight={600} sx={{ marginBottom: 1 }}>
        Add a mapping
      </Typography>
      <Typography
        fontSize={12}
        color={theme.palette.text.tertiary}
        sx={{ marginBottom: 2 }}
      >
        Link this master control to a specific framework requirement. Enter
        the numeric entity id from the framework&apos;s struct table.
      </Typography>

      <Stack spacing={2}>
        {error && (
          <Alert severity="error" sx={{ fontSize: 12 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ fontSize: 12 }}>
            {success}
          </Alert>
        )}

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Select
            id="add-mapping-framework"
            label="Framework"
            value={framework}
            items={frameworkOptions}
            onChange={handleFrameworkChange}
            sx={{ minWidth: 180, flexGrow: 1, height: 34 }}
          />
          <Select
            id="add-mapping-entity-type"
            label="Entity type"
            value={entityType}
            items={entityTypeOptions}
            onChange={handleEntityTypeChange}
            sx={{ minWidth: 180, flexGrow: 1, height: 34 }}
          />
        </Stack>

        <Field
          id="add-mapping-entity-id"
          type="number"
          label="Entity id"
          value={entityIdRaw}
          onChange={(e) => setEntityIdRaw(e.target.value)}
          placeholder="e.g. 42"
          isRequired
        />

        <Stack direction="row" justifyContent="flex-end">
          <CustomizableButton
            variant="contained"
            text={isPending ? "Adding…" : "Add mapping"}
            icon={<Plus size={14} />}
            onClick={handleSubmit}
            isDisabled={isPending || !entityIdRaw}
            sx={{ minWidth: 150, height: 34 }}
          />
        </Stack>
      </Stack>
    </Box>
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
