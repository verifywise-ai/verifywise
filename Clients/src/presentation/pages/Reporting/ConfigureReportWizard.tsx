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
import {
  useCreateScheduledReport,
  useRunTemplateNow,
} from "../../../application/hooks/useReporting";
import { useProjects } from "../../../application/hooks/useProjects";
import useFrameworks from "../../../application/hooks/useFrameworks";
import { useLLMKeyStatus } from "../../../application/hooks/useLLMKeyStatus";
import { showAlert } from "../../../infrastructure/api/customAxios";
import type { AiBlocksConfig } from "../../../domain/interfaces/i.reporting";

// Run now skips Schedule and Delivery entirely: there is no recurrence to set
// up and the run is saved to storage unconditionally (see reportTemplate.ctrl
// runTemplateNow), so there is nothing for either step to configure.
const SCHEDULE_STEPS = ["Scope", "Sections", "AI Insights", "Schedule", "Delivery", "Review"];
const RUN_NOW_STEPS = ["Scope", "Sections", "AI Insights", "Review"];
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
  mode,
  onClose,
}: {
  template: any;
  mode: "schedule" | "run-now";
  onClose: () => void;
}) {
  const STEPS = mode === "run-now" ? RUN_NOW_STEPS : SCHEDULE_STEPS;
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<"project" | "organization">(
    template.default_scope ?? "project",
  );
  const [projectId, setProjectId] = useState<number | null>(null);
  // Seeded from the template's default. An empty list means every framework in
  // scope — a real choice, not a missing one — so canNext is deliberately NOT
  // gated on it.
  const [frameworkIds, setFrameworkIds] = useState<string[]>(
    template.latestVersion?.framework_config?.frameworkIds ?? [],
  );
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
  const { allFrameworks } = useFrameworks({ listOfFrameworks: [] });
  const create = useCreateScheduledReport();
  const runNow = useRunTemplateNow();

  // hasKeys is optimistically true while loading (useLLMKeyStatus.ts:38), so
  // gate on the settled value only — otherwise the blocks flicker from
  // enabled to disabled on mount. Three prior commits chased that flicker;
  // do not "fix" the hook.
  const { hasKeys, loading: llmKeyLoading } = useLLMKeyStatus();
  const aiDisabled = !llmKeyLoading && !hasKeys;

  const enabledSections = sections.filter((s: any) => s.defaultEnabled !== false);

  // Only "native:" ids are reachable from this control. A plugin or custom id
  // seeded on the template is shown verbatim rather than dropped: dropping it
  // would quietly widen the report back to every framework in scope.
  const frameworkLabel = (value: string) =>
    allFrameworks.find((f: any) => `native:${f.id}` === value)?.name ?? value;

  // Select the panel by step name, not numeric index — run-now mode drops
  // Schedule and Delivery, so an index-based check would show the wrong panel.
  const step = STEPS[active];

  const canNext = () => {
    if (step === "Scope" && scope === "project" && !projectId) return false;
    if (step === "Sections" && !sections.some((s: any) => s.defaultEnabled !== false)) return false;
    if (
      step === "Delivery" &&
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
    const base = {
      templateVersionId: template.latestVersion.id,
      name: `${template.name}${scope === "project" ? " - Project" : " - Org"}`,
      scope,
      projectId: scope === "project" ? projectId : null,
      // Always sent, empty included: [] is the explicit "every framework in
      // scope" the backend already treats as the default.
      frameworkIds,
      sectionsConfig: { sections },
      aiBlocksConfig: ai,
      format,
    };

    if (mode === "run-now") {
      runNow.mutate(
        { id: template.id, body: base },
        {
          onSuccess: onClose,
          onError: () =>
            showAlert({ variant: "error", body: "Failed to run report", isToast: true }),
        },
      );
      return;
    }

    create.mutate(
      {
        ...base,
        templateId: template.id,
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

      {step === "Scope" && (
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
          {/* Namespaced ids ("native:2") are what the backend accepts; a bare
              number or a mis-cased prefix is a 400. An empty selection is
              valid and means every framework in scope. */}
          <TextField
            select
            label="Frameworks"
            value={frameworkIds}
            onChange={(e) =>
              setFrameworkIds(
                typeof e.target.value === "string"
                  ? e.target.value.split(",")
                  : (e.target.value as unknown as string[]),
              )
            }
            helperText="Leave empty to include every framework in scope."
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  {(selected as string[]).map((value) => (
                    <Chip key={value} size="small" label={frameworkLabel(value)} />
                  ))}
                </Stack>
              ),
            }}
          >
            {allFrameworks.map((f: any) => (
              <MenuItem key={f.id} value={`native:${f.id}`}>
                {f.name}
              </MenuItem>
            ))}
          </TextField>
          {/* Format lives on a step both modes share. It used to sit on the
              Schedule panel, which run-now drops — so a run-now report was
              always a PDF and the option could not be reached at all. */}
          <TextField
            select
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as "pdf" | "docx")}
          >
            <MenuItem value="pdf">PDF</MenuItem>
            <MenuItem value="docx">Word (DOCX)</MenuItem>
          </TextField>
        </Stack>
      )}

      {step === "Sections" && (
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

      {step === "AI Insights" && (
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
                  onChange={(e) => setAi((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
              }
              label={label}
            />
          ))}
        </Stack>
      )}

      {step === "Schedule" && (
        <Stack spacing={2}>
          <Typography variant="h6">Schedule</Typography>
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
              onChange={(e) => setSchedule((prev: any) => ({ ...prev, timezone: e.target.value }))}
            />
          </Stack>
        </Stack>
      )}

      {step === "Delivery" && (
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

      {step === "Review" && (
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
          {/* Set on the Scope step in both modes, so both have to review it. */}
          <Typography variant="body2">
            <strong>Format:</strong> {format.toUpperCase()}
          </Typography>
          <Box>
            <Typography variant="body2" component="span" sx={{ mr: 1 }}>
              <strong>Frameworks:</strong>
            </Typography>
            {frameworkIds.length ? (
              <Stack direction="row" spacing={1} sx={{ display: "inline-flex", flexWrap: "wrap" }}>
                {frameworkIds.map((value) => (
                  <Chip key={value} size="small" label={frameworkLabel(value)} />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" component="span" color="text.secondary">
                all frameworks in scope
              </Typography>
            )}
          </Box>
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
          {/* Run now bypasses Schedule and Delivery (runTemplateNow hardcodes
              delivery_config to { saveToStorage: true } server-side), so
              showing this mode's leftover default state here would tell the
              user delivery choices they never made and that won't happen. */}
          {mode === "schedule" && (
            <>
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
            </>
          )}
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
            disabled={
              (mode === "run-now" ? runNow.isPending : create.isPending) ||
              !template.latestVersion?.id
            }
            onClick={submit}
          >
            {mode === "run-now" ? "Run now" : "Create Scheduled Report"}
          </Button>
        )}
      </Box>
    </Box>
  );
}
