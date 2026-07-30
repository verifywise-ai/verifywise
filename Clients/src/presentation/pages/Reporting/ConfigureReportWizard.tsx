/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Box, MenuItem, Select as MuiSelect, Stack, Typography, useTheme } from "@mui/material";
import { ChevronDown } from "lucide-react";
import StepperModal from "../../components/Modals/StepperModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import Chip from "../../components/Chip";
import { text as textColors } from "../../themes/palette";
import { getSelectStyles } from "../../utils/inputStyles";
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

const FREQUENCY_ITEMS = FREQUENCIES.map((f) => ({
  _id: f,
  name: f.charAt(0).toUpperCase() + f.slice(1),
}));

const SCOPE_ITEMS = [
  { _id: "project", name: "Project" },
  { _id: "organization", name: "Organization" },
];

const FORMAT_ITEMS = [
  { _id: "pdf", name: "PDF" },
  { _id: "docx", name: "Word (DOCX)" },
];

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

const FRAMEWORKS_LABEL_ID = "configure-report-frameworks-label";
const FRAMEWORKS_INPUT_ID = "configure-report-frameworks";

// Style guide § Typography: body 13px, hint on text.tertiary. The panels carry
// no heading of their own — the stepper already names each step.
const panelHintSx = {
  fontSize: 13,
  lineHeight: 1.5,
  color: textColors.tertiary,
};

const reviewRowSx = {
  fontSize: 13,
  lineHeight: 1.5,
  color: textColors.secondary,
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
  const theme = useTheme();
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
  const isLastStep = active === STEPS.length - 1;

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
    // Nothing can be submitted without a template version to run.
    if (isLastStep && !template.latestVersion?.id) return false;
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
    <StepperModal
      isOpen
      onClose={onClose}
      title={mode === "run-now" ? "Run report" : "Schedule report"}
      steps={STEPS}
      activeStep={active}
      onNext={() => setActive(active + 1)}
      onBack={() => setActive(active - 1)}
      onSubmit={submit}
      canProceed={canNext()}
      isSubmitting={mode === "run-now" ? runNow.isPending : create.isPending}
      submitButtonText={mode === "run-now" ? "Run now" : "Create Scheduled Report"}
      maxWidth="700px"
    >
      {/* No panel heading here: the stepper already labels this step, and a
          second "Scope" on screen would only repeat it. */}
      {step === "Scope" && (
        <Stack spacing={6}>
          <Typography sx={panelHintSx}>
            Choose whether this report covers a single project or the whole organization.
          </Typography>
          <Select
            id="configure-report-level"
            label="Report level"
            value={scope}
            items={SCOPE_ITEMS}
            onChange={(e) => setScope(e.target.value as "project" | "organization")}
            getOptionValue={(item) => item._id}
          />
          {scope === "project" && (
            <Select
              id="configure-report-project"
              label="Project"
              placeholder="Select a project"
              value={projectId ?? ""}
              items={projects.map((p: any) => ({ _id: p.id, name: p.project_title }))}
              onChange={(e) => setProjectId(Number(e.target.value))}
              getOptionValue={(item) => item._id}
            />
          )}
          {/* Multi-select, so the shared Select (single value) cannot be used.
              Same label/menu/border treatment, driven by getSelectStyles.
              Namespaced ids ("native:2") are what the backend accepts; a bare
              number or a mis-cased prefix is a 400. An empty selection is
              valid and means every framework in scope. */}
          <Stack gap={theme.spacing(2)}>
            <Typography
              id={FRAMEWORKS_LABEL_ID}
              component="label"
              htmlFor={FRAMEWORKS_INPUT_ID}
              sx={{
                margin: 0,
                height: "22px",
                display: "flex",
                alignItems: "center",
                fontSize: 13,
                fontWeight: 500,
                color: theme.palette.text.secondary,
              }}
            >
              Frameworks
            </Typography>
            <MuiSelect
              multiple
              labelId={FRAMEWORKS_LABEL_ID}
              value={frameworkIds}
              inputProps={{ id: FRAMEWORKS_INPUT_ID }}
              onChange={(e) =>
                setFrameworkIds(
                  typeof e.target.value === "string"
                    ? e.target.value.split(",")
                    : (e.target.value as unknown as string[]),
                )
              }
              displayEmpty
              renderValue={(selected) =>
                (selected as string[]).length ? (
                  <Stack direction="row" spacing="8px" flexWrap="wrap" useFlexGap>
                    {(selected as string[]).map((value) => (
                      <Chip
                        key={value}
                        label={frameworkLabel(value)}
                        size="small"
                        uppercase={false}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Typography
                    component="span"
                    sx={{ fontSize: 13, color: theme.palette.text.tertiary }}
                  >
                    All frameworks in scope
                  </Typography>
                )
              }
              IconComponent={() => (
                <ChevronDown
                  size={16}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: theme.palette.text.tertiary,
                  }}
                />
              )}
              MenuProps={{
                disableScrollLock: true,
                style: { zIndex: 10001 },
                PaperProps: {
                  sx: {
                    "borderRadius": theme.shape.borderRadius,
                    "boxShadow": theme.boxShadow,
                    "mt": 1,
                    "& .MuiMenuItem-root": {
                      "fontSize": 13,
                      "color": theme.palette.text.primary,
                      "&:hover": {
                        backgroundColor: theme.palette.background.accent,
                        color: theme.palette.primary.main,
                      },
                    },
                  },
                },
              }}
              sx={{
                "fontSize": 13,
                "minWidth": "125px",
                "width": "100%",
                "backgroundColor": theme.palette.background.main,
                "position": "relative",
                ...getSelectStyles(theme, { hasError: false }),
                // Same 34px control height and 10px inset as the shared Select;
                // minHeight rather than height so a long chip list wraps instead
                // of being clipped.
                "& .MuiSelect-select": {
                  minHeight: "34px",
                  boxSizing: "border-box",
                  padding: "4px 32px 4px 10px",
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "4px",
                },
              }}
            >
              {allFrameworks.map((f: any) => (
                <MenuItem key={f.id} value={`native:${f.id}`}>
                  {f.name}
                </MenuItem>
              ))}
            </MuiSelect>
            <Typography sx={{ fontSize: 11, opacity: 0.8, color: theme.palette.text.tertiary }}>
              Leave empty to include every framework in scope.
            </Typography>
          </Stack>
          {/* Format lives on a step both modes share. It used to sit on the
              Schedule panel, which run-now drops — so a run-now report was
              always a PDF and the option could not be reached at all. */}
          <Select
            id="configure-report-format"
            label="Format"
            value={format}
            items={FORMAT_ITEMS}
            onChange={(e) => setFormat(e.target.value as "pdf" | "docx")}
            getOptionValue={(item) => item._id}
          />
        </Stack>
      )}

      {step === "Sections" && (
        <Stack spacing="8px">
          {sections.length === 0 && (
            <Typography sx={panelHintSx}>This template has no configurable sections.</Typography>
          )}
          <Stack>
            {sections.map((s: any) => {
              const key = s.reportSectionKey ?? s.key;
              return (
                <Checkbox
                  key={key}
                  id={`configure-report-section-${key}`}
                  label={s.label ?? key}
                  value={key}
                  size="small"
                  isChecked={s.defaultEnabled !== false}
                  onChange={(e) => toggleSection(key, e.target.checked)}
                />
              );
            })}
          </Stack>
        </Stack>
      )}

      {step === "AI Insights" && (
        <Stack spacing="8px">
          <Typography sx={panelHintSx}>
            Each enabled block is one language-model call per report run.
          </Typography>
          {aiDisabled && (
            <Typography sx={panelHintSx}>
              Add a language-model key in Settings to enable AI insights.
            </Typography>
          )}
          <Stack>
            {AI_BLOCKS.map(({ key, label }) => (
              <Checkbox
                key={key}
                id={`configure-report-ai-${key}`}
                label={label}
                value={key}
                size="small"
                isDisabled={aiDisabled}
                isChecked={!!ai[key]}
                onChange={(e) => setAi((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
            ))}
          </Stack>
        </Stack>
      )}

      {step === "Schedule" && (
        <Stack spacing={6}>
          <Select
            id="configure-report-frequency"
            label="Frequency"
            value={schedule.frequency}
            items={FREQUENCY_ITEMS}
            onChange={(e) =>
              setSchedule((prev: any) => ({ ...prev, frequency: String(e.target.value) }))
            }
            getOptionValue={(item) => item._id}
          />
          <Stack direction="row" spacing={6}>
            <Field
              id="configure-report-hour"
              type="number"
              label="Hour"
              value={schedule.hour}
              min={0}
              max={23}
              onChange={(e) =>
                setSchedule((prev: any) => ({ ...prev, hour: Number(e.target.value) }))
              }
            />
            <Field
              id="configure-report-minute"
              type="number"
              label="Minute"
              value={schedule.minute}
              min={0}
              max={59}
              onChange={(e) =>
                setSchedule((prev: any) => ({ ...prev, minute: Number(e.target.value) }))
              }
            />
            <Field
              id="configure-report-timezone"
              label="Timezone"
              value={schedule.timezone}
              onChange={(e) => setSchedule((prev: any) => ({ ...prev, timezone: e.target.value }))}
            />
          </Stack>
        </Stack>
      )}

      {step === "Delivery" && (
        <Stack spacing="8px">
          <Stack>
            <Checkbox
              id="configure-report-save-to-storage"
              label="Save to storage"
              value="saveToStorage"
              size="small"
              isChecked={delivery.saveToStorage}
              onChange={(e) =>
                setDelivery((prev: any) => ({ ...prev, saveToStorage: e.target.checked }))
              }
            />
            <Checkbox
              id="configure-report-send-email-link"
              label="Send email link"
              value="sendEmailLink"
              size="small"
              isChecked={delivery.sendEmailLink}
              onChange={(e) =>
                setDelivery((prev: any) => ({ ...prev, sendEmailLink: e.target.checked }))
              }
            />
            <Checkbox
              id="configure-report-attach-file"
              label="Attach file"
              value="attachFile"
              size="small"
              isChecked={delivery.attachFile}
              onChange={(e) =>
                setDelivery((prev: any) => ({ ...prev, attachFile: e.target.checked }))
              }
            />
          </Stack>
          {(delivery.sendEmailLink || delivery.attachFile) && (
            <Field
              id="configure-report-recipients"
              label="Recipients"
              placeholder="name@company.com, name2@company.com"
              helperText="Comma separated."
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
            />
          )}
        </Stack>
      )}

      {step === "Review" && (
        <Stack spacing="8px">
          <Typography sx={reviewRowSx}>
            <strong>Template:</strong> {template.name}
          </Typography>
          <Typography sx={reviewRowSx}>
            <strong>Scope:</strong> {scope === "project" ? "Project" : "Organization"}
            {scope === "project" &&
              projectId &&
              ` (${projects.find((p: any) => p.id === projectId)?.project_title ?? projectId})`}
          </Typography>
          {/* Set on the Scope step in both modes, so both have to review it. */}
          <Typography sx={reviewRowSx}>
            <strong>Format:</strong> {format.toUpperCase()}
          </Typography>
          <Box>
            <Typography component="span" sx={{ ...reviewRowSx, mr: "8px" }}>
              <strong>Frameworks:</strong>
            </Typography>
            {frameworkIds.length ? (
              <Stack
                direction="row"
                spacing="8px"
                useFlexGap
                sx={{ display: "inline-flex", flexWrap: "wrap" }}
              >
                {frameworkIds.map((value) => (
                  <Chip key={value} label={frameworkLabel(value)} size="small" uppercase={false} />
                ))}
              </Stack>
            ) : (
              <Typography component="span" sx={{ ...reviewRowSx, color: textColors.tertiary }}>
                all frameworks in scope
              </Typography>
            )}
          </Box>
          <Box>
            <Typography component="span" sx={{ ...reviewRowSx, mr: "8px" }}>
              <strong>Sections:</strong>
            </Typography>
            {enabledSections.length ? (
              <Stack
                direction="row"
                spacing="8px"
                useFlexGap
                sx={{ display: "inline-flex", flexWrap: "wrap" }}
              >
                {enabledSections.map((s: any) => (
                  <Chip
                    key={s.reportSectionKey ?? s.key}
                    label={s.label ?? s.reportSectionKey ?? s.key}
                    size="small"
                    uppercase={false}
                  />
                ))}
              </Stack>
            ) : (
              <Typography component="span" sx={{ ...reviewRowSx, color: textColors.tertiary }}>
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
              <Typography sx={reviewRowSx}>
                <strong>Schedule:</strong> {schedule.frequency} at{" "}
                {String(schedule.hour).padStart(2, "0")}:{String(schedule.minute).padStart(2, "0")}{" "}
                {schedule.timezone}
              </Typography>
              <Typography sx={reviewRowSx}>
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
    </StepperModal>
  );
}
