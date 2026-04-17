/**
 * Controls Hub — Master Control Drawer, Mappings tab.
 *
 * Lists every framework mapping attached to a master control, grouped by
 * framework. Users remove a mapping by clicking its trash icon; adding a
 * new mapping uses the inline searchable picker backed by the framework
 * catalog (real struct rows from controls_struct_eu / subclauses_struct_iso
 * / …). No more raw numeric id entry.
 *
 * Each mapping row now shows:
 *   - Plain-language title + code
 *   - Coverage badge (Full / Partial)
 *   - Confidence badge for seed-imported mappings
 *   - Rationale text (collapsible)
 *   - Inline requirement description preview
 *
 * The server enforces uniqueness on (master_control_id, framework,
 * framework_entity_type, framework_entity_id), so we rely on the list
 * refetch after mutations rather than trying to dedupe in the UI.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  CircularProgress,
  Collapse,
  IconButton,
  SelectChangeEvent,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import Select from "../../../../components/Inputs/Select";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import {
  useFrameworkCatalog,
  useMasterControlMappings,
  useMasterControlMutations,
} from "../../../../../application/hooks/useMasterControls";
import type { FrameworkCatalogEntry } from "../../../../../application/repository/masterControl.repository";
import type {
  Framework,
  FrameworkEntityType,
  MappingCoverage,
  MappingConfidence,
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

const COVERAGE_LABELS: Record<MappingCoverage, string> = {
  full: "Full",
  partial: "Partial",
};

const CONFIDENCE_LABELS: Record<MappingConfidence, string> = {
  direct_match: "Direct match",
  strong_analogy: "Strong analogy",
  partial_overlap: "Partial overlap",
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
  const { data: catalog } = useFrameworkCatalog();

  const grouped = useMemo(() => {
    const bucket = new Map<Framework, MasterControlFrameworkMapping[]>();
    (mappings ?? []).forEach((m) => {
      const list = bucket.get(m.framework) ?? [];
      list.push(m);
      bucket.set(m.framework, list);
    });
    return bucket;
  }, [mappings]);

  // Build a lookup map from framework_entity_type + entity_id → catalog entry
  const catalogLookup = useMemo(() => {
    if (!catalog) return new Map<string, FrameworkCatalogEntry>();
    const map = new Map<string, FrameworkCatalogEntry>();
    for (const [entityType, entries] of Object.entries(catalog)) {
      for (const entry of entries) {
        map.set(`${entityType}:${entry.id}`, entry);
      }
    }
    return map;
  }, [catalog]);

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
                  catalogEntry={catalogLookup.get(
                    `${row.framework_entity_type}:${row.framework_entity_id}`
                  )}
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

// ---------- Mapping row with rationale, coverage, confidence, requirement preview ----------

interface MappingRowProps {
  mapping: MasterControlFrameworkMapping;
  catalogEntry?: FrameworkCatalogEntry;
  onDelete: (m: MasterControlFrameworkMapping) => void;
  disabled: boolean;
}

function MappingRow({ mapping, catalogEntry, onDelete, disabled }: MappingRowProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const primary =
    mapping.framework_entity_code ??
    `${mapping.framework_entity_type} #${mapping.framework_entity_id}`;
  const secondary = mapping.framework_entity_title;
  const coverage = mapping.coverage ?? "full";
  const confidence = mapping.confidence ?? "direct_match";
  const description = catalogEntry?.description;

  const toggleExpanded = useCallback(() => setExpanded((p) => !p), []);

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ padding: "10px 14px" }}
      >
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography fontSize={13} fontWeight={500}>
              {secondary || primary}
            </Typography>
            {secondary && (
              <Typography
                fontSize={11}
                sx={{
                  fontFamily: "monospace",
                  color: theme.palette.text.tertiary,
                  backgroundColor: theme.palette.background.alt,
                  padding: "1px 6px",
                  borderRadius: 0.5,
                }}
              >
                {primary}
              </Typography>
            )}
          </Stack>

          <Stack direction="row" gap={0.75} alignItems="center" sx={{ marginTop: 0.5 }} flexWrap="wrap">
            <Typography
              fontSize={11}
              color={theme.palette.text.tertiary}
              sx={{ fontStyle: "italic" }}
            >
              {ENTITY_TYPE_LABELS[mapping.framework_entity_type] ?? mapping.framework_entity_type}
            </Typography>

            <Box
              sx={{
                padding: "1px 6px",
                borderRadius: 0.5,
                fontSize: 10,
                fontWeight: 600,
                backgroundColor: coverage === "full"
                  ? theme.palette.status.success.bg
                  : theme.palette.status.warning.bg,
                color: coverage === "full"
                  ? theme.palette.status.success.text
                  : theme.palette.status.warning.text,
                border: `1px solid ${coverage === "full"
                  ? theme.palette.status.success.border
                  : theme.palette.status.warning.border}`,
              }}
            >
              {COVERAGE_LABELS[coverage]}
            </Box>

            {confidence !== "direct_match" && (
              <Box
                sx={{
                  padding: "1px 6px",
                  borderRadius: 0.5,
                  fontSize: 10,
                  fontWeight: 500,
                  backgroundColor: theme.palette.background.alt,
                  color: theme.palette.text.secondary,
                  border: `1px solid ${theme.palette.border.light}`,
                }}
              >
                {CONFIDENCE_LABELS[confidence]}
              </Box>
            )}
          </Stack>

          {mapping.rationale && (
            <Typography
              fontSize={12}
              color={theme.palette.text.secondary}
              sx={{ marginTop: 0.5, fontStyle: "italic" }}
            >
              {mapping.rationale}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
          {description && (
            <Tooltip title={expanded ? "Hide requirement" : "Show requirement text"}>
              <IconButton
                size="small"
                onClick={toggleExpanded}
                aria-label={expanded ? "Collapse requirement preview" : "Expand requirement preview"}
              >
                {expanded ? (
                  <ChevronDown size={14} color={theme.palette.text.tertiary} />
                ) : (
                  <ChevronRight size={14} color={theme.palette.text.tertiary} />
                )}
              </IconButton>
            </Tooltip>
          )}
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
      </Stack>

      {description && (
        <Collapse in={expanded}>
          <Box
            sx={{
              padding: "8px 14px 12px",
              backgroundColor: theme.palette.background.alt,
              borderTop: `1px solid ${theme.palette.border.light}`,
            }}
          >
            <Typography
              fontSize={11}
              fontWeight={600}
              sx={{
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: theme.palette.text.tertiary,
                marginBottom: 0.5,
              }}
            >
              Requirement text
            </Typography>
            <Typography fontSize={12} color={theme.palette.text.secondary} sx={{ lineHeight: 1.5 }}>
              {description}
            </Typography>
          </Box>
        </Collapse>
      )}
    </Box>
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
    rationale?: string | null;
    coverage?: MappingCoverage;
    confidence?: MappingConfidence;
  }) => Promise<void>;
}

function AddMappingForm({ masterId: _masterId, isPending, onSubmit }: AddMappingFormProps) {
  const theme = useTheme();
  const [framework, setFramework] = useState<Framework>("eu_ai_act");
  const [entityType, setEntityType] = useState<FrameworkEntityType>(
    ENTITY_TYPES_BY_FRAMEWORK.eu_ai_act[0]
  );
  const [selected, setSelected] = useState<FrameworkCatalogEntry | null>(null);
  const [rationale, setRationale] = useState("");
  const [coverage, setCoverage] = useState<MappingCoverage>("full");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    data: catalog,
    isLoading: catalogLoading,
    error: catalogError,
  } = useFrameworkCatalog();

  // When the framework or entity type changes, drop the previous selection
  // so the picker can't submit a row from the wrong struct table.
  useEffect(() => {
    setSelected(null);
  }, [framework, entityType]);

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

  const coverageOptions = [
    { _id: "full", name: "Full coverage" },
    { _id: "partial", name: "Partial coverage" },
  ];

  const entries: FrameworkCatalogEntry[] = catalog?.[entityType] ?? [];

  const handleFrameworkChange = (event: SelectChangeEvent<string | number>) => {
    const next = event.target.value as Framework;
    setFramework(next);
    setEntityType(ENTITY_TYPES_BY_FRAMEWORK[next][0]);
    setError(null);
  };

  const handleEntityTypeChange = (
    event: SelectChangeEvent<string | number>
  ) => {
    setEntityType(event.target.value as FrameworkEntityType);
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!selected) {
      setError("Pick a requirement from the list.");
      return;
    }

    try {
      await onSubmit({
        framework,
        framework_entity_type: entityType,
        framework_entity_id: selected.id,
        rationale: rationale.trim() || null,
        coverage,
        confidence: "direct_match",
      });
      setSelected(null);
      setRationale("");
      setCoverage("full");
      setSuccess(`Mapped to ${selected.code}.`);
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add mapping.");
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
        Pick a framework, choose the entity type, then search by code or
        title to link this master control to the matching requirement.
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
        {catalogError && (
          <Alert severity="warning" sx={{ fontSize: 12 }}>
            Could not load framework catalog. Try again.
          </Alert>
        )}

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Select
            id="add-mapping-framework"
            label="Framework"
            value={framework}
            items={frameworkOptions}
            onChange={handleFrameworkChange}
            sx={{ minWidth: 220, maxWidth: "100%", flexGrow: 1, height: 34 }}
          />
          <Select
            id="add-mapping-entity-type"
            label="Entity type"
            value={entityType}
            items={entityTypeOptions}
            onChange={handleEntityTypeChange}
            sx={{ minWidth: 220, maxWidth: "100%", flexGrow: 1, height: 34 }}
          />
        </Stack>

        <Stack spacing={1}>
          <Typography
            component="label"
            htmlFor="add-mapping-entity-search"
            fontSize={13}
            fontWeight={500}
            color={theme.palette.text.secondary}
          >
            Requirement
            <Typography
              component="span"
              ml={1}
              color={theme.palette.error.text}
            >
              *
            </Typography>
          </Typography>
          <Autocomplete<FrameworkCatalogEntry>
            id="add-mapping-entity-search"
            size="small"
            options={entries}
            value={selected}
            loading={catalogLoading}
            disabled={catalogLoading || isPending}
            onChange={(_e, value) => setSelected(value)}
            getOptionLabel={(option) => `${option.code} — ${option.title}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(options, state) => {
              const q = state.inputValue.trim().toLowerCase();
              if (!q) return options.slice(0, 200);
              return options
                .filter(
                  (o) =>
                    o.code.toLowerCase().includes(q) ||
                    o.title.toLowerCase().includes(q) ||
                    (o.description?.toLowerCase().includes(q) ?? false)
                )
                .slice(0, 200);
            }}
            renderOption={(props, option) => {
              const { key: _k, ...rest } = props as any;
              return (
                <li key={option.id} {...rest} style={{ display: "block" }}>
                  <Typography fontSize={13} fontWeight={500}>
                    {option.code}
                  </Typography>
                  <Typography
                    fontSize={12}
                    color={theme.palette.text.tertiary}
                    sx={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {option.title}
                  </Typography>
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={
                  catalogLoading
                    ? "Loading framework catalog…"
                    : entries.length === 0
                    ? "No requirements available for this entity type"
                    : "Search by code or title"
                }
                InputProps={{
                  ...params.InputProps,
                  sx: {
                    minHeight: 34,
                    fontSize: 13,
                    paddingTop: "2px !important",
                    paddingBottom: "2px !important",
                  },
                }}
              />
            )}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: theme.shape.borderRadius,
              },
            }}
          />
          {selected?.description && (
            <Typography
              fontSize={11}
              color={theme.palette.text.tertiary}
              sx={{ fontStyle: "italic", lineHeight: 1.4 }}
            >
              {selected.description}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Select
            id="add-mapping-coverage"
            label="Coverage"
            value={coverage}
            items={coverageOptions}
            onChange={(e) => setCoverage(e.target.value as MappingCoverage)}
            sx={{ minWidth: 180, maxWidth: "100%", flexGrow: 1, height: 34 }}
          />
        </Stack>

        <Stack spacing={1}>
          <Typography
            component="label"
            htmlFor="add-mapping-rationale"
            fontSize={13}
            fontWeight={500}
            color={theme.palette.text.secondary}
          >
            Rationale
          </Typography>
          <TextField
            id="add-mapping-rationale"
            size="small"
            multiline
            minRows={2}
            maxRows={4}
            placeholder="Why does this control satisfy this requirement?"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            disabled={isPending}
            InputProps={{
              sx: {
                fontSize: 13,
              },
            }}
          />
        </Stack>

        <Stack direction="row" justifyContent="flex-end">
          <CustomizableButton
            variant="contained"
            text={isPending ? "Adding…" : "Add mapping"}
            icon={<Plus size={14} />}
            onClick={handleSubmit}
            isDisabled={isPending || !selected}
            sx={{ minWidth: 160, height: 34 }}
          />
        </Stack>
      </Stack>
    </Box>
  );
}
