/**
 * @fileoverview Add/Edit Repository Modal
 *
 * StandardModal for registering a new repository or editing an existing one.
 * Includes optional schedule configuration.
 *
 * @module pages/AIDetection/AddRepositoryModal
 */

import { useState, useEffect, useRef } from "react";
import { Stack, Typography, useTheme, IconButton, InputAdornment, Tooltip } from "@mui/material";
import { Copy, Check, RefreshCw } from "lucide-react";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Toggle from "../../components/Inputs/Toggle";
import {
  AIDetectionRepository,
  CreateRepositoryInput,
  UpdateRepositoryInput,
  ScheduleFrequency,
} from "../../../domain/ai-detection/repositoryTypes";
import { generateWebhookSecret } from "../../../application/repository/aiDetectionRepository.repository";

interface AddRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateRepositoryInput | UpdateRepositoryInput) => Promise<void>;
  editingRepository?: AIDetectionRepository | null;
  isSubmitting?: boolean;
  /** When true, auto-enable the schedule toggle on open */
  focusSchedule?: boolean;
}

const FREQUENCY_OPTIONS = [
  { _id: "daily", name: "Daily" },
  { _id: "weekly", name: "Weekly" },
  { _id: "monthly", name: "Monthly" },
];

const DAY_OF_WEEK_OPTIONS = [
  { _id: "0", name: "Sunday" },
  { _id: "1", name: "Monday" },
  { _id: "2", name: "Tuesday" },
  { _id: "3", name: "Wednesday" },
  { _id: "4", name: "Thursday" },
  { _id: "5", name: "Friday" },
  { _id: "6", name: "Saturday" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  _id: String(i),
  name: `${i.toString().padStart(2, "0")}:00`,
}));

const MINUTE_OPTIONS = [
  { _id: "0", name: ":00" },
  { _id: "15", name: ":15" },
  { _id: "30", name: ":30" },
  { _id: "45", name: ":45" },
];

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  _id: String(i + 1),
  name: String(i + 1),
}));

export default function AddRepositoryModal({
  isOpen,
  onClose,
  onSubmit,
  editingRepository,
  isSubmitting = false,
  focusSchedule = false,
}: AddRepositoryModalProps) {
  const theme = useTheme();
  const isEditing = !!editingRepository;

  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>("daily");
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(1);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [scheduleHour, setScheduleHour] = useState(2);
  const [scheduleMinute, setScheduleMinute] = useState(0);

  // CI/CD state
  const [ciEnabled, setCiEnabled] = useState(false);
  const [ciMinScore, setCiMinScore] = useState(70);
  const [ciMaxCritical, setCiMaxCritical] = useState(0);
  const [ciPostComments, setCiPostComments] = useState(true);
  const [ciStatusChecks, setCiStatusChecks] = useState(true);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isGeneratingSecret, setIsGeneratingSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editingRepository) {
      setRepositoryUrl(editingRepository.repository_url);
      setDisplayName(editingRepository.display_name || "");
      setDefaultBranch(editingRepository.default_branch || "main");
      setScheduleEnabled(focusSchedule ? true : editingRepository.schedule_enabled);
      setScheduleFrequency((editingRepository.schedule_frequency as ScheduleFrequency) || "daily");
      setScheduleDayOfWeek(editingRepository.schedule_day_of_week ?? 1);
      setScheduleDayOfMonth(editingRepository.schedule_day_of_month ?? 1);
      setScheduleHour(editingRepository.schedule_hour ?? 2);
      setScheduleMinute(editingRepository.schedule_minute ?? 0);
      // CI/CD fields
      setCiEnabled(editingRepository.ci_enabled ?? false);
      setCiMinScore(editingRepository.ci_min_score ?? 70);
      setCiMaxCritical(editingRepository.ci_max_critical ?? 0);
      setCiPostComments(editingRepository.ci_post_comments ?? true);
      setCiStatusChecks(editingRepository.ci_status_checks ?? true);
      setWebhookSecret(editingRepository.webhook_secret || "");
    } else {
      setRepositoryUrl("");
      setDisplayName("");
      setDefaultBranch("main");
      setScheduleEnabled(false);
      setScheduleFrequency("daily");
      setScheduleDayOfWeek(1);
      setScheduleDayOfMonth(1);
      setScheduleHour(2);
      setScheduleMinute(0);
      // CI/CD defaults
      setCiEnabled(false);
      setCiMinScore(70);
      setCiMaxCritical(0);
      setCiPostComments(true);
      setCiStatusChecks(true);
      setWebhookSecret("");
    }
  }, [editingRepository, isOpen, focusSchedule]);

  const handleSubmit = async () => {
    const ciFields = {
      ci_enabled: ciEnabled,
      ci_min_score: ciMinScore,
      ci_max_critical: ciMaxCritical,
      ci_post_comments: ciPostComments,
      ci_status_checks: ciStatusChecks,
    };

    if (isEditing) {
      const updateData: UpdateRepositoryInput = {
        display_name: displayName || null,
        default_branch: defaultBranch,
        schedule_enabled: scheduleEnabled,
        schedule_frequency: scheduleEnabled ? scheduleFrequency : null,
        schedule_day_of_week:
          scheduleEnabled && scheduleFrequency === "weekly" ? scheduleDayOfWeek : null,
        schedule_day_of_month:
          scheduleEnabled && scheduleFrequency === "monthly" ? scheduleDayOfMonth : null,
        schedule_hour: scheduleHour,
        schedule_minute: scheduleMinute,
        ...ciFields,
      };
      await onSubmit(updateData);
    } else {
      const createData: CreateRepositoryInput = {
        repository_url: repositoryUrl,
        display_name: displayName || null,
        default_branch: defaultBranch,
        schedule_enabled: scheduleEnabled,
        schedule_frequency: scheduleEnabled ? scheduleFrequency : null,
        schedule_day_of_week:
          scheduleEnabled && scheduleFrequency === "weekly" ? scheduleDayOfWeek : null,
        schedule_day_of_month:
          scheduleEnabled && scheduleFrequency === "monthly" ? scheduleDayOfMonth : null,
        schedule_hour: scheduleHour,
        schedule_minute: scheduleMinute,
        ...ciFields,
      };
      await onSubmit(createData);
    }
  };

  const backendBaseUrl =
    import.meta.env.VITE_APP_API_BASE_URL ||
    `${window.location.protocol}//${window.location.hostname}:3000`;
  const webhookUrl = `${backendBaseUrl}/api/webhooks/github`;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGenerateSecret = async () => {
    if (!editingRepository?.id) return;
    setIsGeneratingSecret(true);
    try {
      const result = await generateWebhookSecret(editingRepository.id);
      setWebhookSecret(result.webhook_secret);
    } catch {
      // Error handled by API layer
    } finally {
      setIsGeneratingSecret(false);
    }
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit repository" : "Add repository"}
      description={
        isEditing
          ? "Update repository settings and scan schedule."
          : "Register a GitHub repository for monitoring and optional scheduled scans."
      }
      onSubmit={handleSubmit}
      submitButtonText={isEditing ? "Save changes" : "Add repository"}
      isSubmitting={isSubmitting}
    >
      <Stack spacing={6}>
        {/* Repository section */}
        <Stack spacing={4}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, color: theme.palette.text.primary }}
          >
            Repository
          </Typography>

          <Field
            label="GitHub URL"
            placeholder="https://github.com/owner/repo"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            disabled={isEditing}
            isRequired
          />

          <Stack direction="row" spacing={4}>
            <Field
              label="Display name"
              placeholder="Optional friendly name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Field
              label="Default branch"
              placeholder="main"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Stack>
        </Stack>

        {/* Schedule section */}
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" spacing={4}>
              <Toggle
                checked={scheduleEnabled}
                onChange={() => setScheduleEnabled(!scheduleEnabled)}
                size="small"
              />
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 600, color: theme.palette.text.primary }}
              >
                Scheduled scans
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              Automatically scan this repository on a recurring schedule.
            </Typography>
          </Stack>

          {scheduleEnabled && (
            <Stack spacing={4}>
              <Select
                id="schedule-frequency"
                label="Frequency"
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value as ScheduleFrequency)}
                items={FREQUENCY_OPTIONS}
                sx={{ maxWidth: 220 }}
              />

              {scheduleFrequency === "weekly" && (
                <Select
                  id="schedule-day-of-week"
                  label="Day of week"
                  value={String(scheduleDayOfWeek)}
                  onChange={(e) => setScheduleDayOfWeek(Number(e.target.value))}
                  items={DAY_OF_WEEK_OPTIONS}
                  sx={{ maxWidth: 220 }}
                />
              )}

              {scheduleFrequency === "monthly" && (
                <Select
                  id="schedule-day-of-month"
                  label="Day of month"
                  value={String(scheduleDayOfMonth)}
                  onChange={(e) => setScheduleDayOfMonth(Number(e.target.value))}
                  items={DAY_OF_MONTH_OPTIONS}
                  sx={{ maxWidth: 220 }}
                />
              )}

              <Stack direction="row" spacing={4}>
                <Select
                  id="schedule-hour"
                  label="Hour (UTC)"
                  value={String(scheduleHour)}
                  onChange={(e) => setScheduleHour(Number(e.target.value))}
                  items={HOUR_OPTIONS}
                  sx={{ width: 140 }}
                />
                <Select
                  id="schedule-minute"
                  label="Minute"
                  value={String(scheduleMinute)}
                  onChange={(e) => setScheduleMinute(Number(e.target.value))}
                  items={MINUTE_OPTIONS}
                  sx={{ width: 120 }}
                />
              </Stack>
            </Stack>
          )}
        </Stack>

        {/* CI/CD Integration section */}
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" spacing={4}>
              <Toggle checked={ciEnabled} onChange={() => setCiEnabled(!ciEnabled)} size="small" />
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 600, color: theme.palette.text.primary }}
              >
                CI/CD Integration
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              Run scans on pull requests and block merges that exceed risk thresholds.
            </Typography>
          </Stack>

          {ciEnabled && (
            <Stack spacing={4}>
              {/* Webhook URL */}
              <Field
                label="Webhook URL"
                value={webhookUrl}
                disabled
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={copiedField === "url" ? "Copied!" : "Copy"}>
                        <IconButton size="small" onClick={() => copyToClipboard(webhookUrl, "url")}>
                          {copiedField === "url" ? <Check size={16} /> : <Copy size={16} />}
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
              />

              {/* Webhook Secret */}
              {isEditing && (
                <Stack spacing={2}>
                  <Field
                    label="Webhook Secret"
                    type="password"
                    value={webhookSecret || "No secret generated yet"}
                    disabled
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {webhookSecret && (
                            <Tooltip title={copiedField === "secret" ? "Copied!" : "Copy"}>
                              <IconButton
                                size="small"
                                onClick={() => copyToClipboard(webhookSecret, "secret")}
                              >
                                {copiedField === "secret" ? (
                                  <Check size={16} />
                                ) : (
                                  <Copy size={16} />
                                )}
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title={webhookSecret ? "Regenerate secret" : "Generate secret"}>
                            <IconButton
                              size="small"
                              onClick={handleGenerateSecret}
                              disabled={isGeneratingSecret}
                            >
                              <RefreshCw
                                size={16}
                                style={
                                  isGeneratingSecret
                                    ? { animation: "spin 1s linear infinite" }
                                    : undefined
                                }
                              />
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                    Use this secret when configuring the webhook in your GitHub repository settings.
                  </Typography>
                </Stack>
              )}

              {/* Thresholds */}
              <Stack direction="row" spacing={4}>
                <Field
                  label="Risk score threshold"
                  type="number"
                  value={String(ciMinScore)}
                  onChange={(e) =>
                    setCiMinScore(Math.max(0, Math.min(100, Number(e.target.value))))
                  }
                  helperText="Scans scoring above this will fail the check"
                  sx={{ flex: 1 }}
                />
                <Field
                  label="Max critical findings"
                  type="number"
                  value={String(ciMaxCritical)}
                  onChange={(e) => setCiMaxCritical(Math.max(0, Number(e.target.value)))}
                  helperText="Scans with more findings will fail"
                  sx={{ flex: 1 }}
                />
              </Stack>

              {/* Toggles */}
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: theme.palette.text.primary }}>
                    Post PR comments
                  </Typography>
                  <Toggle
                    checked={ciPostComments}
                    onChange={() => setCiPostComments(!ciPostComments)}
                    size="small"
                  />
                </Stack>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: theme.palette.text.primary }}>
                    Post status checks
                  </Typography>
                  <Toggle
                    checked={ciStatusChecks}
                    onChange={() => setCiStatusChecks(!ciStatusChecks)}
                    size="small"
                  />
                </Stack>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>
    </StandardModal>
  );
}
