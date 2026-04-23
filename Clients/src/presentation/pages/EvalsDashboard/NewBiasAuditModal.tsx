/**
 * NewBiasAuditModal - Multi-step modal for creating a new bias audit
 *
 * Uses StepperModal to guide users through:
 * 1. Selecting a compliance framework preset
 * 2. Entering AEDT (Automated Employment Decision Tool) information
 * 3. Uploading demographic data and mapping columns
 * 4. Reviewing configuration and running the audit
 *
 * @component
 */

import { useState, useEffect, useRef, ChangeEvent } from "react";
import dayjs from "dayjs";
import { Box, Stack, Typography, CircularProgress, Alert, useTheme } from "@mui/material";
import Chip from "../../components/Chip";
import { Upload, FileSpreadsheet, Info } from "lucide-react";
import VWTooltip from "../../components/VWTooltip";
import VWAlert from "../../components/Alert";
import StepperModal from "../../components/Modals/StepperModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import DatePicker from "../../components/Inputs/Datepicker";
import {
  listBiasAuditPresets,
  getBiasAuditPreset,
  runBiasAudit,
  type BiasAuditPresetSummary,
  type BiasAuditPreset,
  type BiasAuditMetric,
  type CreateBiasAuditConfig,
} from "../../../application/repository/deepEval.repository";
import { getAllEntities } from "../../../application/repository/entity.repository";
import { palette } from "../../themes/palette";

/** Parse a single CSV row handling quoted fields (RFC 4180). */
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { result.push(""); break; }
    if (line[i] === '"') {
      let value = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      result.push(value.trim());
      if (i < line.length && line[i] === ',') i++; // skip delimiter
    } else {
      const next = line.indexOf(',', i);
      if (next === -1) {
        result.push(line.substring(i).trim());
        break;
      }
      result.push(line.substring(i, next).trim());
      i = next + 1;
    }
  }
  return result;
}

/** Escape HTML entities to prevent XSS in rendered text. */
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface NewBiasAuditModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Callback when modal closes */
  onClose: () => void;
  /** Organization ID for the audit */
  orgId: string;
  /** Callback when audit is successfully created */
  onAuditCreated: (auditId: string) => void;
}

/**
 * PresetCard - Card component for displaying a bias audit preset
 */
function PresetCard({
  preset,
  selected,
  onClick,
}: {
  preset: BiasAuditPresetSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const theme = useTheme();
  const modeColors: Record<string, { bg: string; color: string }> = {
    quantitative_audit: { bg: palette.status.success.bg, color: palette.status.success.text },
    impact_assessment: { bg: palette.accent.blue.bg, color: palette.accent.blue.text },
    compliance_checklist: { bg: palette.accent.orange.bg, color: palette.accent.orange.text },
    framework_assessment: { bg: palette.accent.purple.bg, color: palette.accent.purple.text },
    custom: { bg: palette.background.accent, color: palette.text.secondary },
  };

  const modeLabels: Record<string, string> = {
    quantitative_audit: "Quantitative",
    impact_assessment: "Assessment",
    compliance_checklist: "Checklist",
    framework_assessment: "Framework",
    custom: "Custom",
  };

  const mc = modeColors[preset.mode] || modeColors.custom;

  return (
    <Box
      onClick={onClick}
      sx={{
        border: `1px solid ${selected ? theme.palette.primary.main : theme.palette.border.dark}`,
        borderRadius: "4px",
        p: "8px",
        cursor: "pointer",
        backgroundColor: selected ? palette.brand.primaryLight : theme.palette.background.paper,
        "&:hover": { borderColor: theme.palette.primary.main },
        transition: "border-color 0.15s",
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
            {preset.name}
          </Typography>
          <Chip
            label={modeLabels[preset.mode] || preset.mode}
            size="small"
            uppercase={false}
            backgroundColor={mc.bg}
            textColor={mc.color}
          />
        </Stack>
        <Typography
          sx={{
            fontSize: 12,
            color: theme.palette.text.secondary,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {preset.description}
        </Typography>
      </Stack>
    </Box>
  );
}

const NewBiasAuditModal: React.FC<NewBiasAuditModalProps> = ({
  isOpen,
  onClose,
  orgId,
  onAuditCreated,
}) => {
  // Step control
  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Preset selection
  const [presets, setPresets] = useState<BiasAuditPresetSummary[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [fullPreset, setFullPreset] = useState<BiasAuditPreset | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [loadingPreset, setLoadingPreset] = useState(false);

  // Context-aware labels based on selected preset
  const systemLabel = (() => {
    if (!selectedPresetId) return { step: "AI system", heading: "AI system information", description: "Provide details about the AI system being audited", field: "System name", reviewLabel: "System name" };
    if (selectedPresetId === "nyc_ll144") return { step: "AEDT", heading: "AEDT information", description: "Provide details about the automated employment decision tool being audited", field: "AEDT name", reviewLabel: "AEDT name" };
    if (["eeoc_guidelines", "california_feha", "illinois_hb3773", "new_jersey", "singapore_wfa", "texas_traiga"].includes(selectedPresetId)) return { step: "AI tool", heading: "AI hiring tool information", description: "Provide details about the AI-assisted hiring tool being audited", field: "Tool name", reviewLabel: "Tool name" };
    return { step: "AI system", heading: "AI system information", description: "Provide details about the AI system being audited", field: "System name", reviewLabel: "System name" };
  })();

  // Step 2: system metadata
  const [aedtName, setAedtName] = useState("");
  const [aedtDescription, setAedtDescription] = useState("");
  const [distributionDate, setDistributionDate] = useState("");
  const [dataSourceDescription, setDataSourceDescription] = useState("");

  // Step 3: Demographic data
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [metric, setMetric] = useState<BiasAuditMetric>("selection_rate");
  const [outcomeColumn, setOutcomeColumn] = useState("");
  const [scoreColumn, setScoreColumn] = useState("");
  const [predictionColumn, setPredictionColumn] = useState("");
  const [groundTruthColumn, setGroundTruthColumn] = useState("");

  // Step 4: Review & run
  const [threshold, setThreshold] = useState<number | null>(0.8);
  const [smallSampleExclusion, setSmallSampleExclusion] = useState<number | null>(null);
  const [intersectionalEnabled, setIntersectionalEnabled] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ show: boolean; variant: "success" | "error" | "info"; title: string; body: string } | null>(null);
  const presetRequestIdRef = useRef(0);

  // Model inventory link
  const [modelInventories, setModelInventories] = useState<Array<{ id: number; provider: string; model: string; version: string; status: string }>>([]);
  const [selectedModelInventoryId, setSelectedModelInventoryId] = useState<number | null>(null);

  // Load presets on modal open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingPresets(true);
    setPresetsError(null);
    listBiasAuditPresets()
      .then((data) => {
        const custom = data.filter((p) => p.id === "custom");
        const rest = data.filter((p) => p.id !== "custom");
        setPresets([...custom, ...rest]);
      })
      .catch((err) => {
        console.error("Failed to load presets:", err);
        setPresetsError("Failed to load compliance frameworks. Please try again.");
      })
      .finally(() => setLoadingPresets(false));
  }, [isOpen]);

  // Load model inventories on modal open
  useEffect(() => {
    if (!isOpen) return;
    getAllEntities({ routeUrl: "/modelInventory" })
      .then((response) => {
        if (response?.data) {
          setModelInventories(response.data);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Handle preset selection (request ID prevents race conditions on rapid clicks)
  const handlePresetSelect = async (presetId: string) => {
    setSelectedPresetId(presetId);
    setLoadingPreset(true);
    const requestId = ++presetRequestIdRef.current;
    try {
      const preset = await getBiasAuditPreset(presetId);
      if (requestId !== presetRequestIdRef.current) return;
      setFullPreset(preset);
      setThreshold(preset.threshold ?? 0.8);
      setSmallSampleExclusion(preset.small_sample_exclusion ?? null);
      setIntersectionalEnabled(preset.intersectional?.required ?? false);
    } catch (err) {
      if (requestId !== presetRequestIdRef.current) return;
      console.error("Failed to load preset:", err);
      setSelectedPresetId(null);
    } finally {
      if (requestId === presetRequestIdRef.current) {
        setLoadingPreset(false);
      }
    }
  };

  // Handle CSV file upload and parsing
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (50 MB limit, matching backend)
    if (file.size > 50 * 1024 * 1024) {
      setSubmitError("File too large. Maximum size is 50 MB.");
      return;
    }

    setCsvFile(file);

    const reader = new FileReader();
    reader.onerror = () => {
      console.error("Failed to read CSV file");
      setCsvFile(null);
      setSubmitError("Failed to read file. Please try again.");
    };
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          setCsvFile(null);
          return;
        }
        const lines = text.split("\n").filter((l) => l.trim());
        if (lines.length === 0) {
          setCsvFile(null);
          return;
        }

        const headers = parseCSVRow(lines[0]);
        setCsvHeaders(headers);

        const preview: string[][] = [];
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          preview.push(parseCSVRow(lines[i]));
        }
        setCsvPreview(preview);
      } catch (err) {
        console.error("Failed to parse CSV:", err);
        setCsvFile(null);
        setSubmitError("Failed to parse CSV file.");
      }
    };
    reader.readAsText(file);
  };

  // Handle column mapping change
  const handleColumnMappingChange = (categoryKey: string, columnName: string) => {
    setColumnMapping((prev) => ({ ...prev, [categoryKey]: columnName }));
  };

  // Handle final submission
  const handleSubmit = async () => {
    if (!csvFile || !fullPreset) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const config: CreateBiasAuditConfig = {
        presetId: fullPreset.id,
        presetName: fullPreset.name,
        mode: fullPreset.mode,
        metric,
        orgId,
        categories: fullPreset.categories,
        intersectional: {
          required: intersectionalEnabled,
          cross: fullPreset.intersectional?.cross || [],
        },
        metrics: fullPreset.metrics,
        threshold,
        smallSampleExclusion: smallSampleExclusion,
        outcomeColumn: metric === "selection_rate" ? outcomeColumn : "",
        scoreColumn: metric === "scoring_rate" ? scoreColumn : undefined,
        predictionColumn:
          metric === "fairness_metrics" ? predictionColumn : undefined,
        groundTruthColumn:
          metric === "fairness_metrics" ? groundTruthColumn : undefined,
        columnMapping: Object.fromEntries(
          Object.entries(columnMapping).filter(([, v]) => v)
        ),
        systemName: aedtName,
        systemDescription: aedtDescription,
        dataSource: dataSourceDescription,
        metadata: {
          distribution_date: distributionDate,
        },
        modelInventoryId: selectedModelInventoryId || undefined,
      };
      const result = await runBiasAudit(csvFile, config);
      const rowCount = csvPreview.length > 0 ? `${csvHeaders.length} columns` : "";
      setAlert({
        show: true,
        variant: "success",
        title: "Bias audit started",
        body: `Your ${fullPreset.name} audit is now processing${rowCount ? ` (${rowCount})` : ""}. This typically takes 5–15 seconds. Results will appear automatically when ready.`,
      });
      setTimeout(() => setAlert(null), 6000);
      onAuditCreated(result.auditId);
      handleClose();
    } catch (err: any) {
      console.error("Failed to create bias audit:", err);
      setSubmitError(err?.response?.data?.detail || "Failed to create audit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset all state on close
  const handleClose = () => {
    setActiveStep(0);
    setSelectedPresetId(null);
    setFullPreset(null);
    setAedtName("");
    setAedtDescription("");
    setDistributionDate("");
    setDataSourceDescription("");
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvPreview([]);
    setColumnMapping({});
    setMetric("selection_rate");
    setOutcomeColumn("");
    setScoreColumn("");
    setPredictionColumn("");
    setGroundTruthColumn("");
    setThreshold(0.8);
    setSmallSampleExclusion(null);
    setIntersectionalEnabled(false);
    setSubmitError(null);
    setPresetsError(null);
    setSelectedModelInventoryId(null);
    onClose();
  };

  // Determine if current step is valid
  const canProceed = (() => {
    switch (activeStep) {
      case 0:
        return !!selectedPresetId && !loadingPreset;
      case 1:
        return aedtName.trim().length > 0;
      case 2: {
        if (!csvFile) return false;
        // Metric-specific column requirements
        const metricColumns: string[] = [];
        if (metric === "selection_rate") {
          if (!outcomeColumn) return false;
          metricColumns.push(outcomeColumn);
        } else if (metric === "scoring_rate") {
          if (!scoreColumn) return false;
          metricColumns.push(scoreColumn);
        } else if (metric === "fairness_metrics") {
          if (!predictionColumn || !groundTruthColumn) return false;
          if (predictionColumn === groundTruthColumn) return false;
          metricColumns.push(predictionColumn, groundTruthColumn);
        }
        // Only require mapping for categories with defined groups (non-empty)
        const requiredKeys = Object.entries(fullPreset?.categories || {})
          .filter(([, cat]) => cat.groups && cat.groups.length > 0)
          .map(([key]) => key);
        if (!requiredKeys.every((key) => !!columnMapping[key])) return false;
        const mappedValues = Object.values(columnMapping).filter(Boolean);
        // Prevent duplicate column mappings (same CSV column mapped to multiple categories)
        if (new Set(mappedValues).size !== mappedValues.length) return false;
        // Metric columns must not overlap with category columns
        if (metricColumns.some((col) => mappedValues.includes(col))) return false;
        return true;
      }
      case 3:
        return true;
      default:
        return false;
    }
  })();

  // Render step content
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return renderStep1();
      case 1:
        return renderStep2();
      case 2:
        return renderStep3();
      case 3:
        return renderStep4();
      default:
        return null;
    }
  };

  // Step 1: Compliance framework selection
  const renderStep1 = () => (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: 1 }}>
          Select a compliance framework
        </Typography>
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: 3 }}>
          Choose the regulatory framework that applies to your bias audit
        </Typography>
      </Box>

      {presetsError && (
        <Alert severity="error" sx={{ mb: 2, fontSize: 13 }}>
          {presetsError}
        </Alert>
      )}

      {loadingPresets ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={32} sx={{ color: "primary.main" }} />
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "8px",
          }}
        >
          {presets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              selected={selectedPresetId === preset.id}
              onClick={() => handlePresetSelect(preset.id)}
            />
          ))}
        </Box>
      )}

    </Stack>
  );

  // Step 2: System metadata
  const renderStep2 = () => (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: 1 }}>
          {systemLabel.heading}
        </Typography>
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: 3 }}>
          {systemLabel.description}
        </Typography>
      </Box>

      <Field
        id="aedt-name"
        label={systemLabel.field}
        placeholder="Enter the name of your decision tool"
        value={aedtName}
        onChange={(e) => setAedtName(e.target.value)}
        isRequired
      />

      <Field
        id="aedt-description"
        label="Description"
        placeholder="Describe the purpose and function of this tool"
        value={aedtDescription}
        onChange={(e) => setAedtDescription(e.target.value)}
        type="description"
        rows={3}
        isOptional
      />

      <DatePicker
        label="Distribution date"
        date={distributionDate ? dayjs(distributionDate) : null}
        handleDateChange={(value) => setDistributionDate(value ? value.format("YYYY-MM-DD") : "")}
        isOptional
      />

      <Field
        id="data-source-description"
        label="Data source description"
        placeholder="e.g., Historical hiring records from Jan–Dec 2025, sourced from the company's ATS (applicant tracking system)"
        value={dataSourceDescription}
        onChange={(e) => setDataSourceDescription(e.target.value)}
        type="description"
        rows={3}
        isOptional
      />

      <Box mt="16px">
        <Select
          id="model-inventory-link"
          label="Link to model inventory (optional)"
          placeholder="None — don't link to inventory"
          value={selectedModelInventoryId !== null ? String(selectedModelInventoryId) : ""}
          onChange={(e) =>
            setSelectedModelInventoryId(e.target.value === "" ? null : Number(e.target.value))
          }
          items={[
            { _id: "", name: "None — don't link to inventory" },
            ...modelInventories.map((m) => ({
              _id: String(m.id),
              name: `${m.provider} — ${m.model} (v${m.version})`,
            })),
          ]}
          sx={{ width: "100%" }}
        />
      </Box>
    </Stack>
  );

  // Step 3: Demographic data upload and mapping
  const renderStep3 = () => {
    const categories = Object.values(fullPreset?.categories || {});
    const requiredCategories = categories.filter((c) => c.groups && c.groups.length > 0);
    const categoryNames = requiredCategories.map((c) => c.label);
    const exampleGroups = requiredCategories.length > 0
      ? requiredCategories[0].groups.slice(0, 2).join(", ") + (requiredCategories[0].groups.length > 2 ? ", ..." : "")
      : "";

    return (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: 1 }}>
          Upload applicant data
        </Typography>
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: 2 }}>
          Upload a CSV file where each row represents one applicant. The file must include demographic columns and a binary outcome column.
        </Typography>
      </Box>

      {/* Metric mode selector */}
      <Box>
        <Stack direction="row" alignItems="center" spacing={0.5} mb={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
            Audit metric
          </Typography>
          <VWTooltip
            content="The metric determines what your CSV needs to contain. Selection rate works for binary hire/reject decisions. Scoring rate is for tools that output a continuous score — it compares how often each group scores above the overall median. Fairness metrics compute TPR, FPR, and equalized odds from model predictions vs. ground truth."
            placement="top"
            maxWidth={320}
          >
            <Box sx={{ display: "flex", cursor: "help" }}>
              <Info size={14} strokeWidth={1.5} color={palette.text.accent} />
            </Box>
          </VWTooltip>
        </Stack>
        <Select
          id="metric-mode"
          value={metric}
          onChange={(e) => setMetric(e.target.value as BiasAuditMetric)}
          items={[
            { _id: "selection_rate", name: "Selection rate (binary outcome)" },
            { _id: "scoring_rate", name: "Scoring rate (continuous score, LL144 compliant)" },
            { _id: "fairness_metrics", name: "Fairness metrics (prediction + ground truth)" },
          ]}
        />
      </Box>

      {/* Data requirements */}
      <Box sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px", p: "12px", backgroundColor: palette.background.accent }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: 1 }}>
          Required columns
        </Typography>
        <Stack spacing={0.75}>
          {categoryNames.map((name) => (
            <Stack key={name} direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: palette.brand.primary, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                <strong>{name}</strong> — demographic group for each applicant{name === categoryNames[0] && exampleGroups ? ` (e.g., ${exampleGroups})` : ""}
              </Typography>
            </Stack>
          ))}
          {metric === "selection_rate" && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: palette.brand.primary, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                <strong>Outcome</strong> — binary result column (1/yes/selected = selected, 0/no = not selected)
              </Typography>
            </Stack>
          )}
          {metric === "scoring_rate" && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: palette.brand.primary, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                <strong>Score</strong> — numeric column. Impact ratio is computed from the rate at which each group scores above the overall median.
              </Typography>
            </Stack>
          )}
          {metric === "fairness_metrics" && (
            <>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: palette.brand.primary, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                  <strong>Prediction</strong> — binary column with what the model predicted
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: palette.brand.primary, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                  <strong>Ground truth</strong> — binary column with the actual correct answer
                </Typography>
              </Stack>
            </>
          )}
        </Stack>
        <Typography sx={{ fontSize: 11, color: palette.text.accent, mt: 1.5 }}>
          Column names don't need to match exactly — you'll map them in the next section after uploading.
        </Typography>
      </Box>

      {/* File upload area */}
      <Box
        sx={{
          border: `2px dashed ${palette.border.dark}`,
          borderRadius: "4px",
          p: 4,
          textAlign: "center",
          cursor: "pointer",
          "&:hover": { borderColor: palette.brand.primary, backgroundColor: palette.background.accent },
          position: "relative",
        }}
        onClick={() => document.getElementById("csv-upload-input")?.click()}
      >
        <input
          id="csv-upload-input"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        {csvFile ? (
          <Stack alignItems="center" spacing={1}>
            <FileSpreadsheet size={32} color={palette.brand.primary} strokeWidth={1.5} />
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.primary }}>
              {csvFile.name}
            </Typography>
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              {csvHeaders.length} columns detected
            </Typography>
          </Stack>
        ) : (
          <Stack alignItems="center" spacing={1}>
            <Upload size={32} color={palette.text.accent} strokeWidth={1.5} />
            <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
              Click to upload CSV file
            </Typography>
            <Typography sx={{ fontSize: 12, color: palette.text.accent }}>
              Comma-separated values with demographic columns
            </Typography>
          </Stack>
        )}
      </Box>

      {/* Column mapping */}
      {csvFile && csvHeaders.length > 0 && (
        <Stack spacing="8px" mt={3}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
            Column mapping
          </Typography>

          {Object.entries(fullPreset?.categories || {})
            .sort(([, a], [, b]) => {
              // Show categories with groups first (required), then optional ones
              const aRequired = a.groups && a.groups.length > 0;
              const bRequired = b.groups && b.groups.length > 0;
              if (aRequired && !bRequired) return -1;
              if (!aRequired && bRequired) return 1;
              return 0;
            })
            .map(([key, cat]) => {
              const isOptional = !cat.groups || cat.groups.length === 0;
              return (
                <Stack key={key} direction="row" alignItems="center" spacing={2}>
                  <Typography sx={{ fontSize: 13, color: isOptional ? palette.text.accent : palette.text.tertiary, minWidth: 140 }}>
                    {cat.label}{isOptional ? " (optional)" : ""}
                  </Typography>
                  <Select
                    id={`mapping-${key}`}
                    value={columnMapping[key] || ""}
                    onChange={(e) =>
                      handleColumnMappingChange(key, String(e.target.value))
                    }
                    items={csvHeaders.map((h) => ({ _id: h, name: h }))}
                    placeholder={isOptional ? "Not available" : `Select column for ${cat.label}`}
                    sx={{ flex: 1 }}
                  />
                </Stack>
              );
            })}

          {metric === "selection_rate" && (
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, minWidth: 140 }}>
                Outcome column
              </Typography>
              <Select
                id="outcome-column"
                value={outcomeColumn}
                onChange={(e) => setOutcomeColumn(String(e.target.value))}
                items={csvHeaders.map((h) => ({ _id: h, name: h }))}
                placeholder="Select outcome column"
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {metric === "scoring_rate" && (
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography sx={{ fontSize: 13, color: palette.text.tertiary, minWidth: 140 }}>
                Score column
              </Typography>
              <Select
                id="score-column"
                value={scoreColumn}
                onChange={(e) => setScoreColumn(String(e.target.value))}
                items={csvHeaders.map((h) => ({ _id: h, name: h }))}
                placeholder="Select numeric score column"
                sx={{ flex: 1 }}
              />
            </Stack>
          )}

          {metric === "fairness_metrics" && (
            <>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography sx={{ fontSize: 13, color: palette.text.tertiary, minWidth: 140 }}>
                  Prediction column
                </Typography>
                <Select
                  id="prediction-column"
                  value={predictionColumn}
                  onChange={(e) => setPredictionColumn(String(e.target.value))}
                  items={csvHeaders.map((h) => ({ _id: h, name: h }))}
                  placeholder="Select prediction column"
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography sx={{ fontSize: 13, color: palette.text.tertiary, minWidth: 140 }}>
                  Ground truth column
                </Typography>
                <Select
                  id="ground-truth-column"
                  value={groundTruthColumn}
                  onChange={(e) => setGroundTruthColumn(String(e.target.value))}
                  items={csvHeaders.map((h) => ({ _id: h, name: h }))}
                  placeholder="Select ground truth column"
                  sx={{ flex: 1 }}
                />
              </Stack>
            </>
          )}
        </Stack>
      )}

      {/* CSV preview */}
      {csvPreview.length > 0 && (
        <Box mt={3}>
          <Typography
            sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: 2 }}
          >
            Data preview
          </Typography>
          <Box
            sx={{
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              overflow: "auto",
            }}
          >
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <Box component="thead">
                <Box component="tr" sx={{ backgroundColor: palette.background.accent }}>
                  {csvHeaders.map((header, idx) => (
                    <Box
                      component="th"
                      key={idx}
                      sx={{
                        py: 1,
                        px: 1.5,
                        textAlign: "left",
                        fontWeight: 600,
                        color: palette.text.secondary,
                        borderBottom: `1px solid ${palette.border.dark}`,
                      }}
                    >
                      {header}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box component="tbody">
                {csvPreview.map((row, rowIdx) => (
                  <Box
                    component="tr"
                    key={rowIdx}
                    sx={{
                      borderBottom: rowIdx < csvPreview.length - 1 ? `1px solid ${palette.border.light}` : "none",
                    }}
                  >
                    {row.map((cell, cellIdx) => (
                      <Box
                        component="td"
                        key={cellIdx}
                        sx={{ py: 1, px: 1.5, color: palette.text.tertiary, fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {escapeHtml(cell)}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Stack>
  );
  };

  // Step 4: Review & run
  const renderStep4 = () => (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: 1 }}>
          Review & run
        </Typography>
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: 3 }}>
          Review your configuration and adjust audit settings before running
        </Typography>
      </Box>

      {submitError && (
        <Alert severity="error" onClose={() => setSubmitError(null)} sx={{ fontSize: 13 }}>
          {submitError}
        </Alert>
      )}

      {/* Summary */}
      <Box sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px", p: "8px" }}>
        <Typography
          sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mb: 1 }}
        >
          Summary
        </Typography>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between">
            <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
              Framework
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.primary, fontWeight: 500 }}>
              {fullPreset?.name}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
              {systemLabel.reviewLabel}
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.primary }}>
              {aedtName}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>Dataset</Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.primary }}>
              {csvFile?.name}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
              Categories
            </Typography>
            <Typography sx={{ fontSize: 13, color: palette.text.primary }}>
              {Object.keys(fullPreset?.categories || {}).length}
            </Typography>
          </Stack>
        </Stack>
      </Box>

      {/* Audit settings */}
      <Stack spacing={2}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
          Audit settings
        </Typography>
        <Stack direction="row" spacing={2}>
          <Stack sx={{ flex: 1 }} spacing={0.5}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>Threshold (4/5ths rule)</Typography>
              <VWTooltip
                content="Groups with an impact ratio below this threshold are flagged for adverse impact. The standard 4/5ths rule uses 0.80, meaning a group's selection rate must be at least 80% of the highest group's rate."
                placement="top"
                maxWidth={300}
              >
                <Box sx={{ display: "flex", cursor: "help" }}>
                  <Info size={14} strokeWidth={1.5} color={palette.text.accent} />
                </Box>
              </VWTooltip>
            </Stack>
            <Field
              id="threshold"
              type="number"
              value={threshold?.toString() || ""}
              onChange={(e) => {
                const val = e.target.value ? parseFloat(e.target.value) : null;
                setThreshold(val !== null ? Math.min(1, Math.max(0, val)) : null);
              }}
            />
          </Stack>
          <Stack sx={{ flex: 1 }} spacing={0.5}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>Small sample exclusion %</Typography>
              <VWTooltip
                content="Groups representing less than this percentage of total applicants are excluded from impact ratio calculations. This prevents statistically unreliable results from very small groups. Default is 2%."
                placement="top"
                maxWidth={300}
              >
                <Box sx={{ display: "flex", cursor: "help" }}>
                  <Info size={14} strokeWidth={1.5} color={palette.text.accent} />
                </Box>
              </VWTooltip>
            </Stack>
            <Field
              id="small-sample-exclusion"
              type="number"
              value={smallSampleExclusion?.toString() || ""}
              onChange={(e) => {
                const val = e.target.value ? parseFloat(e.target.value) : null;
                setSmallSampleExclusion(val !== null ? Math.min(100, Math.max(0, val)) : null);
              }}
            />
          </Stack>
        </Stack>
        {fullPreset?.intersectional && (
          <Checkbox
            id="intersectional-analysis"
            label={`Enable intersectional analysis (${fullPreset.intersectional.cross.join(" × ")})`}
            isChecked={intersectionalEnabled}
            value="intersectional"
            onChange={(e) => setIntersectionalEnabled(e.target.checked)}
            size="small"
          />
        )}
      </Stack>
    </Stack>
  );

  return (
    <>
    <StepperModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New bias audit"
      steps={[
        "Compliance framework",
        systemLabel.step,
        "Demographic data",
        "Review & run",
      ]}
      activeStep={activeStep}
      onNext={() => setActiveStep((prev) => prev + 1)}
      onBack={() => setActiveStep((prev) => prev - 1)}
      onSubmit={handleSubmit}
      canProceed={canProceed}
      isSubmitting={isSubmitting}
      submitButtonText="Run audit"
      maxWidth="900px"
    >
      {renderStepContent()}
    </StepperModal>

    {alert?.show && (
      <VWAlert
        variant={alert.variant}
        title={alert.title}
        body={alert.body}
        isToast
        onClick={() => setAlert(null)}
      />
    )}
    </>
  );
};

export default NewBiasAuditModal;
