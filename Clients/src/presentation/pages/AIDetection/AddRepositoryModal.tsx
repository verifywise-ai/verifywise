/**
 * @fileoverview Add/Edit Repository Modal
 *
 * StandardModal for registering a new repository or editing an existing one.
 * Includes optional schedule and CI/CD configuration. When a save turns CI/CD
 * on, the modal switches to a setup step with the webhook URL, the secret the
 * server generated, and the GitHub steps to finish the connection. The secret
 * is only ever shown right after it is generated: reads never return it.
 *
 * @module pages/AIDetection/AddRepositoryModal
 */

import { useState, useEffect, useRef, type FocusEvent } from "react";
import {
  Box,
  Stack,
  Typography,
  useTheme,
  IconButton,
  InputAdornment,
  Tooltip,
} from "@mui/material";
import { Copy, Check } from "lucide-react";
import StandardModal from "../../components/Modals/StandardModal";
import Alert from "../../components/Alert";
import { CustomizableButton } from "../../components/button/customizable-button";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Toggle from "../../components/Inputs/Toggle";
import {
  AIDetectionRepository,
  CreateRepositoryInput,
  UpdateRepositoryInput,
  ScheduleFrequency,
  WebhookDeliveryStatus,
} from "../../../domain/ai-detection/repositoryTypes";
import { generateWebhookSecret } from "../../../application/repository/aiDetectionRepository.repository";
import { useWebhookConfig } from "../../../application/hooks/useWebhookConfig";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";
import { radiusPx } from "../../themes/palette";
import {
  formatUtcTimeInLocal,
  isWholeNumber,
  maxCriticalError,
  minScoreError,
} from "./repositoryForm";

interface AddRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Saves the repository and resolves with the saved record, or with nothing
   * when the save failed (the caller reports the error). The modal closes
   * itself after a save, or shows the CI/CD setup step first.
   */
  onSubmit: (
    data: CreateRepositoryInput | UpdateRepositoryInput,
  ) => Promise<AIDetectionRepository | void>;
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

const DEFAULT_MIN_SCORE = 70;
const DEFAULT_MAX_CRITICAL = 0;

const DELIVERY_STATUS_TEXT: Record<WebhookDeliveryStatus, string> = {
  ok: "Received",
  error: "Received, but the scan could not start",
};

const GITHUB_STEPS = [
  "In your GitHub repository, open Settings → Webhooks → Add webhook.",
  "Paste the webhook URL as the payload URL, set the content type to application/json and paste the secret.",
  "Choose Let me select individual events, tick Pull requests and Pushes, then click Add webhook.",
];

/** Fallback when the server has no public address: the address the app talks to. */
function browserWebhookUrl(): string {
  const apiBase = (import.meta.env.VITE_APP_API_BASE_URL || "").replace(/\/+$/, "");
  const base = apiBase.replace(/\/api$/, "") || window.location.origin;
  return `${base}/api/webhooks/github`;
}

export default function AddRepositoryModal({
  isOpen,
  onClose,
  onSubmit,
  editingRepository,
  isSubmitting = false,
  focusSchedule = false,
}: AddRepositoryModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
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

  // CI/CD state. Thresholds are kept as typed so invalid input can be shown.
  const [ciEnabled, setCiEnabled] = useState(false);
  const [ciMinScore, setCiMinScore] = useState(String(DEFAULT_MIN_SCORE));
  const [ciMaxCritical, setCiMaxCritical] = useState(String(DEFAULT_MAX_CRITICAL));
  const [ciPostComments, setCiPostComments] = useState(true);
  const [ciStatusChecks, setCiStatusChecks] = useState(true);
  /** A secret generated in this modal session; the server never sends it on reads. */
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isGeneratingSecret, setIsGeneratingSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  /** The field whose copy failed; its value is then shown for manual copying. */
  const [copyFailedField, setCopyFailedField] = useState<string | null>(null);
  /** Set after a save that turned CI/CD on: the modal shows the setup step. */
  const [setupRepository, setSetupRepository] = useState<AIDetectionRepository | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSetupRepository(null);
    setWebhookSecret("");
    setCopiedField(null);
    setCopyFailedField(null);
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
      setCiMinScore(String(editingRepository.ci_min_score ?? DEFAULT_MIN_SCORE));
      setCiMaxCritical(String(editingRepository.ci_max_critical ?? DEFAULT_MAX_CRITICAL));
      setCiPostComments(editingRepository.ci_post_comments ?? true);
      setCiStatusChecks(editingRepository.ci_status_checks ?? true);
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
      setCiMinScore(String(DEFAULT_MIN_SCORE));
      setCiMaxCritical(String(DEFAULT_MAX_CRITICAL));
      setCiPostComments(true);
      setCiStatusChecks(true);
    }
  }, [editingRepository, isOpen, focusSchedule]);

  // The webhook URL comes from the server's public address settings. It is
  // only needed once CI/CD is on, and it is cached across modal opens.
  const { data: webhookConfig } = useWebhookConfig(isOpen && (ciEnabled || !!setupRepository));

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  const minScoreValidation = ciEnabled ? minScoreError(ciMinScore) : undefined;
  const maxCriticalValidation = ciEnabled ? maxCriticalError(ciMaxCritical) : undefined;
  const hasThresholdError = !!minScoreValidation || !!maxCriticalValidation;

  const handleSubmit = async () => {
    if (hasThresholdError) return;

    const ciFields = {
      ci_enabled: ciEnabled,
      ci_min_score: isWholeNumber(ciMinScore) ? Number(ciMinScore) : DEFAULT_MIN_SCORE,
      ci_max_critical: isWholeNumber(ciMaxCritical) ? Number(ciMaxCritical) : DEFAULT_MAX_CRITICAL,
      ci_post_comments: ciPostComments,
      ci_status_checks: ciStatusChecks,
    };
    const scheduleFields = {
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
    };

    const data: CreateRepositoryInput | UpdateRepositoryInput = isEditing
      ? { ...scheduleFields, ...ciFields }
      : { repository_url: repositoryUrl, ...scheduleFields, ...ciFields };

    const saved = await onSubmit(data);
    if (!saved) return;

    // The server returns the secret only when this save generated it (CI/CD
    // turned on for the first time). That needs a step in GitHub, so show it
    // before closing.
    if (saved.ci_enabled && saved.webhook_secret) {
      setSetupRepository(saved);
      return;
    }
    onClose();
  };

  const webhookUrl = webhookConfig?.webhook_url || browserWebhookUrl();
  const showReachabilityWarning = !!webhookConfig && !webhookConfig.is_public;
  const hasWebhookSecret = !!webhookSecret || !!editingRepository?.has_webhook_secret;

  /**
   * Copy a value. "Copied" is shown only when the write succeeded; the
   * clipboard API is missing on plain-http deployments and can be refused, so
   * a failure says so and leaves the value visible to copy by hand.
   */
  const copyToClipboard = async (text: string, field: string) => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard not available");
      await navigator.clipboard.writeText(text);
      setCopyFailedField(null);
      setCopiedField(field);
      copyTimeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopiedField(null);
      setCopyFailedField(field);
    }
  };

  const selectAll = (event: FocusEvent<HTMLInputElement>) => event.target.select();

  const copyFailedAlert = (field: string) =>
    copyFailedField === field ? (
      <Alert
        variant="error"
        inline
        hasIcon={false}
        body="Could not copy to the clipboard. Select the text and copy it manually."
      />
    ) : null;

  const handleGenerateSecret = async () => {
    if (!editingRepository?.id) return;
    setIsGeneratingSecret(true);
    try {
      const result = await generateWebhookSecret(editingRepository.id);
      setWebhookSecret(result.webhook_secret);
      setCopyFailedField(null);
    } catch {
      // Error handled by API layer
    } finally {
      setIsGeneratingSecret(false);
    }
  };

  const copyAdornment = (value: string, field: string, label: string) => (
    <Tooltip title={copiedField === field ? t("Copied") : t("Copy")}>
      <IconButton size="small" aria-label={label} onClick={() => copyToClipboard(value, field)}>
        {copiedField === field ? <Check size={16} /> : <Copy size={16} />}
      </IconButton>
    </Tooltip>
  );

  /** A read-only secret with a copy button. Shown as text if copying failed. */
  const secretField = (secret: string) => (
    <Field
      label="Webhook secret"
      type={copyFailedField === "secret" ? "text" : "password"}
      value={secret}
      onFocus={selectAll}
      InputProps={{
        readOnly: true,
        endAdornment: (
          <InputAdornment position="end">
            {copyAdornment(secret, "secret", "Copy webhook secret")}
          </InputAdornment>
        ),
      }}
    />
  );

  const webhookUrlField = (
    <Stack sx={{ gap: "4px" }}>
      <Field
        label="Webhook URL"
        value={webhookUrl}
        onFocus={selectAll}
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              {copyAdornment(webhookUrl, "url", "Copy webhook URL")}
            </InputAdornment>
          ),
        }}
      />
      {copyFailedAlert("url")}
      {showReachabilityWarning && (
        <Box
          role="status"
          sx={{
            p: "8px 12px",
            borderRadius: radiusPx.sm,
            border: `1px solid ${theme.palette.status.warning.border}`,
            backgroundColor: theme.palette.status.warning.bg,
          }}
        >
          <Typography variant="caption" sx={{ color: theme.palette.status.warning.text }}>
            GitHub must be able to reach this address. If it is not reachable from the internet, set
            API_PUBLIC_URL on the server to the public address of this deployment's API.
          </Typography>
        </Box>
      )}
    </Stack>
  );

  const sectionTitleSx = { fontWeight: 600, color: theme.palette.text.primary };
  const captionSx = { color: theme.palette.text.secondary };

  if (setupRepository) {
    const secret = setupRepository.webhook_secret || "";
    return (
      <StandardModal
        isOpen={isOpen}
        onClose={onClose}
        title="Connect GitHub"
        description="Add this webhook in GitHub so pull requests and pushes start scans."
        onSubmit={onClose}
        submitButtonText="Done"
        showCancelButton={false}
      >
        <Stack sx={{ gap: "16px" }}>
          {webhookUrlField}

          <Stack sx={{ gap: "4px" }}>
            {secretField(secret)}
            {copyFailedAlert("secret")}
            <Typography variant="caption" sx={captionSx}>
              Copy the secret now. It is not shown again. To replace it, edit the repository and
              regenerate the secret.
            </Typography>
          </Stack>

          <Stack sx={{ gap: "8px" }}>
            <Typography variant="subtitle2" sx={sectionTitleSx}>
              Set up the webhook in GitHub
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: "20px" }}>
              {GITHUB_STEPS.map((step) => (
                <Typography
                  key={step}
                  component="li"
                  variant="body2"
                  sx={{ color: theme.palette.text.primary, mb: "4px" }}
                >
                  {step}
                </Typography>
              ))}
            </Box>
            <Typography variant="caption" sx={captionSx}>
              Pushes to the default branch start a full scan. Opened and updated pull requests start
              a scan of the changed files. Results are posted to GitHub with the token from AI
              Detection settings.
            </Typography>
          </Stack>
        </Stack>
      </StandardModal>
    );
  }

  const scheduleTime = formatUtcTimeInLocal(scheduleHour, scheduleMinute);
  const lastDeliveryAt = editingRepository?.last_webhook_at
    ? new Date(editingRepository.last_webhook_at).toLocaleString()
    : null;
  const lastDeliveryStatus = editingRepository?.last_webhook_status;

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
      isSubmitDisabled={hasThresholdError}
    >
      <Stack sx={{ gap: "12px" }}>
        {/* Repository section */}
        <Stack sx={{ gap: "8px" }}>
          <Typography variant="subtitle2" sx={sectionTitleSx}>
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

          <Stack direction="row" sx={{ gap: "8px" }}>
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
        <Stack sx={{ gap: "8px" }}>
          <Stack sx={{ gap: "2px" }}>
            <Stack direction="row" alignItems="center" sx={{ gap: "8px" }}>
              <Toggle
                checked={scheduleEnabled}
                onChange={() => setScheduleEnabled(!scheduleEnabled)}
                size="small"
              />
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                Scheduled scans
              </Typography>
            </Stack>
            <Typography variant="caption" sx={captionSx}>
              Automatically scan this repository on a recurring schedule.
            </Typography>
          </Stack>

          {scheduleEnabled && (
            <Stack sx={{ gap: "8px" }}>
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

              <Stack sx={{ gap: "4px" }}>
                <Stack direction="row" sx={{ gap: "8px" }}>
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
                <Typography variant="caption" sx={captionSx} data-testid="schedule-local-time">
                  {fill(t("{utc} UTC = {local} your time"), scheduleTime)}
                </Typography>
              </Stack>
            </Stack>
          )}
        </Stack>

        {/* CI/CD integration section */}
        <Stack sx={{ gap: "8px" }}>
          <Stack sx={{ gap: "2px" }}>
            <Stack direction="row" alignItems="center" sx={{ gap: "8px" }}>
              <Toggle checked={ciEnabled} onChange={() => setCiEnabled(!ciEnabled)} size="small" />
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                CI/CD integration
              </Typography>
            </Stack>
            <Typography variant="caption" sx={captionSx}>
              Scan pull requests and pushes to the default branch, then post the result to GitHub.
            </Typography>
          </Stack>

          {ciEnabled && (
            <Stack sx={{ gap: "8px" }}>
              {webhookUrlField}

              {/* Webhook secret: never read back. Editing shows whether one is set and
                  lets an editor replace it; the new value is shown once. */}
              {isEditing && hasWebhookSecret ? (
                <Stack sx={{ gap: "4px" }}>
                  {webhookSecret && secretField(webhookSecret)}
                  {webhookSecret && copyFailedAlert("secret")}
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ gap: "8px" }}
                  >
                    <Typography
                      variant="caption"
                      sx={captionSx}
                      data-testid="webhook-secret-status"
                    >
                      {webhookSecret
                        ? t(
                            "Copy the new secret now. It is not shown again. Update it in the GitHub webhook too.",
                          )
                        : t(
                            "A webhook secret is set. It is only shown when it is created. Regenerate it if you need it again, then update it in GitHub.",
                          )}
                    </Typography>
                    <CustomizableButton
                      text="Regenerate secret"
                      variant="outlined"
                      onClick={handleGenerateSecret}
                      loading={isGeneratingSecret}
                      isDisabled={isGeneratingSecret}
                      sx={{ flexShrink: 0 }}
                    />
                  </Stack>
                </Stack>
              ) : (
                <Typography variant="caption" sx={captionSx}>
                  A webhook secret is created when you save. The next step shows how to add it in
                  GitHub.
                </Typography>
              )}

              {isEditing && editingRepository?.ci_enabled && (
                <Typography variant="caption" sx={captionSx} data-testid="last-webhook-delivery">
                  {lastDeliveryAt && lastDeliveryStatus && DELIVERY_STATUS_TEXT[lastDeliveryStatus]
                    ? fill(t("Last delivery: {time}. {status}"), {
                        time: lastDeliveryAt,
                        status: t(DELIVERY_STATUS_TEXT[lastDeliveryStatus]),
                      })
                    : t("No webhook deliveries received yet.")}
                </Typography>
              )}

              {/* Thresholds */}
              <Stack direction="row" sx={{ gap: "8px" }}>
                <Field
                  id="ci-min-score"
                  label="Minimum governance score"
                  type="number"
                  min={0}
                  max={100}
                  value={ciMinScore}
                  onChange={(e) => setCiMinScore(e.target.value)}
                  helperText="PR checks fail when the score is below this"
                  error={minScoreValidation}
                  sx={{ flex: 1 }}
                />
                <Field
                  id="ci-max-critical"
                  label="Max critical findings"
                  type="number"
                  min={0}
                  value={ciMaxCritical}
                  onChange={(e) => setCiMaxCritical(e.target.value)}
                  helperText="PR checks fail when a scan has more critical findings than this"
                  error={maxCriticalValidation}
                  sx={{ flex: 1 }}
                />
              </Stack>

              {/* Toggles */}
              <Stack sx={{ gap: "4px" }}>
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
