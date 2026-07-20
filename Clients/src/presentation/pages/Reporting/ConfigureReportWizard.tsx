/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Stepper,
  Step,
  StepLabel,
  Box,
  Button,
  MenuItem,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  Stack,
  Chip,
} from "@mui/material";
import { useCreateScheduledReport } from "../../../application/hooks/useReporting";
import { useProjects } from "../../../application/hooks/useProjects";
import { useLLMKeyStatus } from "../../../application/hooks/useLLMKeyStatus";
import { showAlert } from "../../../infrastructure/api/customAxios";
import type { AiBlocksConfig } from "../../../domain/interfaces/i.reporting";

const STEPS = ["Scope", "Sections", "AI Insights", "Schedule", "Delivery", "Review"];
const FREQUENCIES = ["daily", "weekly", "monthly"];

// The seven blocks Phase 2 shipped on the backend. Previously three of these
// were hardcoded here and the other four were unreachable from the UI.
const AI_BLOCKS: Array<{ key: keyof AiBlocksConfig; label: string }> = [
  { key: "sectionSummaries", label: "Per-section summaries" },
  { key: "executiveSummary", label: "Executive summary" },
  { key: "keyFindings", label: "Key findings" },
  { key: "recommendedActions", label: "Recommended actions" },
  { key: "riskAnalysis", label: "Risk analysis" },
  { key: "complianceGap", label: "Compliance gap analysis" },
  { key: "vendorRisk", label: "Third-party risk analysis" },
];

// complianceGap and vendorRisk default off: each enabled block is one
// language-model call on every scheduled run.
const DEFAULT_AI_BLOCKS: AiBlocksConfig = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

export default function ConfigureReportWizard({
  template,
  onClose,
}: {
  template: any;
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<"project" | "organization">(
    template.default_scope ?? "project",
  );
  const [projectId, setProjectId] = useState<number | null>(null);
  const [sections, setSections] = useState<any[]>(
    template.latestVersion?.sections_config?.sections ?? [],
  );
  const [ai, setAi] = useState<AiBlocksConfig>(
    template.latestVersion?.ai_blocks_config ?? DEFAULT_AI_BLOCKS,
  );
  // ponytail: no template carries a format in format_config today (it is
  // persisted as {}), so there is nothing to seed from — plain "pdf" default.
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [schedule, setSchedule] = useState<any>({
    frequency: template.recommended_frequency ?? "daily",
    hour: 9,
    minute: 0,
    timezone: "UTC",
  });
  const [delivery, setDelivery] = useState<any>({
    saveToStorage: true,
    sendEmailLink: true,
    attachFile: false,
    recipients: [] as string[],
  });
  const [recipientsText, setRecipientsText] = useState("");

  const { data: projects = [] } = useProjects();
  const create = useCreateScheduledReport();

  // hasKeys is optimistically true while loading (useLLMKeyStatus.ts:38), so
  // gate on the settled value only — otherwise the blocks flicker from
  // enabled to disabled on mount. Three prior commits chased that flicker;
  // do not "fix" the hook.
  const { hasKeys, loading: llmKeyLoading } = useLLMKeyStatus();
  const aiDisabled = !llmKeyLoading && !hasKeys;

  const enabledSections = sections.filter((s: any) => s.defaultEnabled !== false);

  const canNext = () => {
    if (active === 0 && scope === "project" && !projectId) return false;
    if (active === 1 && !sections.some((s: any) => s.defaultEnabled !== false)) return false;
    if (
      active === 4 &&
      !delivery.saveToStorage &&
      !delivery.sendEmailLink &&
      !delivery.attachFile
    )
      return false;
    return true;
  };

  const toggleSection = (key: string, checked: boolean) => {
    setSections((prev: any[]) =>
      prev.map((s: any) =>
        (s.reportSectionKey ?? s.key) === key ? { ...s, defaultEnabled: checked } : s,
      ),
    );
  };

  const parseRecipients = (text: string) =>
    text
      .split(/[,\s]+/)
      .map((r) => r.trim())
      .filter(Boolean);

  const submit = () => {
    if (!template.latestVersion?.id) return;
    create.mutate(
      {
        templateId: template.id,
        templateVersionId: template.latestVersion?.id,
        name: `${template.name}${scope === "project" ? " - Project" : " - Org"}`,
        scope,
        projectId: scope === "project" ? projectId : null,
        sectionsConfig: { sections },
        aiBlocksConfig: ai,
        format,
        scheduleConfig: schedule,
        deliveryConfig: { ...delivery, recipients: parseRecipients(recipientsText) },
      },
      {
        onSuccess: onClose,
        onError: () =>
          showAlert({
            variant: "error",
            body: "Failed to create scheduled report",
            isToast: true,
          }),
      },
    );
  };

  return (
    <Box sx={{ p: 3, minWidth: 600 }}>
      <Stepper activeStep={active} sx={{ mb: 3 }}>
        {STEPS.map((s) => (
          <Step key={s}>
            <StepLabel>{s}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {active === 0 && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Choose whether this report covers a single project or the whole organization.
          </Typography>
          <TextField
            select
            label="Report level"
            value={scope}
            onChange={(e) => setScope(e.target.value as "project" | "organization")}
          >
            <MenuItem value="project">Project</MenuItem>
            <MenuItem value="organization">Organization</MenuItem>
          </TextField>
          {scope === "project" && (
            <TextField
              select
              label="Project"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(Number(e.target.value))}
            >
              {projects.map((p: any) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.project_title}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      )}

      {active === 1 && (
        <Stack spacing={1}>
          <Typography variant="h6">Sections</Typography>
          {sections.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              This template has no configurable sections.
            </Typography>
          )}
          {sections.map((s: any) => {
            const key = s.reportSectionKey ?? s.key;
            return (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={s.defaultEnabled !== false}
                    onChange={(e) => toggleSection(key, e.target.checked)}
                  />
                }
                label={s.label ?? key}
              />
            );
          })}
        </Stack>
      )}

      {active === 2 && (
        <Stack spacing={1}>
          <Typography variant="h6">AI insights</Typography>
          <Typography variant="body2" color="text.secondary">
            Each enabled block is one language-model call per report run.
          </Typography>
          {aiDisabled && (
            <Typography variant="body2" color="text.secondary">
              Add a language-model key in Settings to enable AI insights.
            </Typography>
          )}
          {AI_BLOCKS.map(({ key, label }) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  disabled={aiDisabled}
                  checked={!!ai[key]}
                  onChange={(e) =>
                    setAi((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
              }
              label={label}
            />
          ))}
        </Stack>
      )}

      {active === 3 && (
        <Stack spacing={2}>
          <Typography variant="h6">Schedule</Typography>
          <TextField
            select
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as "pdf" | "docx")}
          >
            <MenuItem value="pdf">PDF</MenuItem>
            <MenuItem value="docx">Word (DOCX)</MenuItem>
          </TextField>
          <TextField
            select
            label="Frequency"
            value={schedule.frequency}
            onChange={(e) => setSchedule((prev: any) => ({ ...prev, frequency: e.target.value }))}
          >
            {FREQUENCIES.map((f) => (
              <MenuItem key={f} value={f}>
                {f}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField
              type="number"
              label="Hour"
              value={schedule.hour}
              onChange={(e) =>
                setSchedule((prev: any) => ({ ...prev, hour: Number(e.target.value) }))
              }
              inputProps={{ min: 0, max: 23 }}
            />
            <TextField
              type="number"
              label="Minute"
              value={schedule.minute}
              onChange={(e) =>
                setSchedule((prev: any) => ({ ...prev, minute: Number(e.target.value) }))
              }
              inputProps={{ min: 0, max: 59 }}
            />
            <TextField
              label="Timezone"
              value={schedule.timezone}
              onChange={(e) =>
                setSchedule((prev: any) => ({ ...prev, timezone: e.target.value }))
              }
            />
          </Stack>
        </Stack>
      )}

      {active === 4 && (
        <Stack spacing={1}>
          <Typography variant="h6">Delivery</Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={delivery.saveToStorage}
                onChange={(e) =>
                  setDelivery((prev: any) => ({ ...prev, saveToStorage: e.target.checked }))
                }
              />
            }
            label="Save to storage"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={delivery.sendEmailLink}
                onChange={(e) =>
                  setDelivery((prev: any) => ({ ...prev, sendEmailLink: e.target.checked }))
                }
              />
            }
            label="Send email link"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={delivery.attachFile}
                onChange={(e) =>
                  setDelivery((prev: any) => ({ ...prev, attachFile: e.target.checked }))
                }
              />
            }
            label="Attach file"
          />
          {(delivery.sendEmailLink || delivery.attachFile) && (
            <TextField
              label="Recipients (comma separated)"
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              fullWidth
            />
          )}
        </Stack>
      )}

      {active === 5 && (
        <Stack spacing={1}>
          <Typography variant="h6">Review</Typography>
          <Typography variant="body2">
            <strong>Template:</strong> {template.name}
          </Typography>
          <Typography variant="body2">
            <strong>Scope:</strong> {scope}
            {scope === "project" &&
              projectId &&
              ` (${projects.find((p: any) => p.id === projectId)?.project_title ?? projectId})`}
          </Typography>
          <Box>
            <Typography variant="body2" component="span" sx={{ mr: 1 }}>
              <strong>Sections:</strong>
            </Typography>
            {enabledSections.length ? (
              <Stack direction="row" spacing={1} sx={{ display: "inline-flex", flexWrap: "wrap" }}>
                {enabledSections.map((s: any) => (
                  <Chip
                    key={s.reportSectionKey ?? s.key}
                    size="small"
                    label={s.label ?? s.reportSectionKey ?? s.key}
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" component="span" color="text.secondary">
                none
              </Typography>
            )}
          </Box>
          <Typography variant="body2">
            <strong>Schedule:</strong> {schedule.frequency} at{" "}
            {String(schedule.hour).padStart(2, "0")}:{String(schedule.minute).padStart(2, "0")}{" "}
            {schedule.timezone}
          </Typography>
          <Typography variant="body2">
            <strong>Delivery:</strong>{" "}
            {[
              delivery.saveToStorage && "storage",
              delivery.sendEmailLink && "email link",
              delivery.attachFile && "attachment",
            ]
              .filter(Boolean)
              .join(", ")}
          </Typography>
        </Stack>
      )}

      <Box sx={{ mt: 3, display: "flex", justifyContent: "space-between" }}>
        <Button disabled={active === 0} onClick={() => setActive(active - 1)}>
          Back
        </Button>
        {active < STEPS.length - 1 ? (
          <Button variant="contained" disabled={!canNext()} onClick={() => setActive(active + 1)}>
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={create.isPending || !template.latestVersion?.id}
            onClick={submit}
          >
            Create Scheduled Report
          </Button>
        )}
      </Box>
    </Box>
  );
}
