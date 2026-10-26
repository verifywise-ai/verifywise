import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Chip, CircularProgress, Divider, Stack, Typography } from "@mui/material";
import { VWField, VWSelect } from "../../../components/VWComponents";
import { CustomizableButton } from "../../../components/button/customizable-button";
import ExtensionSyncPanel from "../../../components/ExtensionSyncPanel";
import { useAuth } from "../../../../application/hooks/useAuth";
import { getApiErrorReason } from "../../../../application/utils/apiErrorReason";
import { getAllProjects } from "../../../../application/repository/project.repository";
import {
  getJiraIncidentEvents,
  getJiraIncidentsConfig,
  getJiraIssueTypes,
  getJiraLabels,
  getJiraPriorities,
  getJiraProjects,
  getJiraStatuses,
  saveJiraIncidentsConfig,
  testJiraIncidentsConnection,
  type JiraIncidentEvent,
  type JiraIncidentsConfigView,
  type JiraStatusOption,
} from "../../../../application/repository/jiraIncidents.repository";
import {
  DONT_CHANGE_JIRA,
  FormState,
  fromView,
  INCIDENT_TYPES,
  SEVERITIES,
  toInput,
  validateForm,
  VW_STATUSES,
  withSeverityDefaults,
  withStatusDefaults,
} from "./formState";
import { MappingTable } from "./MappingTable";
import { SyncActivity } from "./SyncActivity";
import { describeJiraIncidentsRun } from "./runOutcome";

const CONTROL_HEIGHT_SX = { height: 30, minHeight: 30 };
const LABEL_DEBOUNCE_MS = 300;
const MAX_LABEL_SUGGESTIONS = 10;
const EVENTS_SHOWN = 50;
const toItems = (values: readonly string[]) => values.map((v) => ({ _id: v, name: v }));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} color="text.primary" sx={{ mb: "16px" }}>
        {title}
      </Typography>
      <Stack sx={{ gap: "16px" }}>{children}</Stack>
    </Box>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
      {children}
    </Typography>
  );
}

export function JiraIncidentsConfiguration() {
  const { userRoleName } = useAuth();
  const isAdmin = userRoleName === "Admin";

  const [view, setView] = useState<JiraIncidentsConfigView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Array<{ id: string; key: string; name: string }>>([]);
  const [issueTypes, setIssueTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [statuses, setStatuses] = useState<JiraStatusOption[]>([]);
  const [priorities, setPriorities] = useState<Array<{ id: string; name: string }>>([]);
  const [useCases, setUseCases] = useState<Array<{ _id: number; name: string }>>([]);
  const [labelSuggestions, setLabelSuggestions] = useState<string[]>([]);
  const [events, setEvents] = useState<JiraIncidentEvent[]>([]);
  const [eventsFailed, setEventsFailed] = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportPickerError = (err: unknown) =>
    setPickerError(getApiErrorReason(err) ?? "Could not load the options from Jira.");

  const loadStatuses = useCallback(async (projectId: string, issueTypeId: string) => {
    try {
      const result = await getJiraStatuses(projectId, issueTypeId);
      setStatuses(result.statuses);
      setForm((f) =>
        f
          ? withStatusDefaults(
              f,
              result,
              result.statuses.map((s) => s.id),
            )
          : f,
      );
    } catch (err) {
      setStatuses([]);
      reportPickerError(err);
    }
  }, []);

  const loadIssueTypes = useCallback(async (projectId: string) => {
    try {
      setIssueTypes(await getJiraIssueTypes(projectId));
    } catch (err) {
      setIssueTypes([]);
      reportPickerError(err);
    }
  }, []);

  /** The pickers that need a saved connection: projects, issue types, statuses, priorities. */
  const loadPickers = useCallback(
    async (saved: JiraIncidentsConfigView) => {
      if (!saved.has_api_token || !saved.site_url) return;
      setPickerError(null);
      try {
        const [projectList, priorityResult] = await Promise.all([
          getJiraProjects(),
          getJiraPriorities(),
        ]);
        setProjects(projectList);
        setPriorities(priorityResult.priorities);
        setForm((f) =>
          f
            ? withSeverityDefaults(
                f,
                priorityResult.default_severity_map,
                priorityResult.priorities.map((p) => p.id),
              )
            : f,
        );
      } catch (err) {
        reportPickerError(err);
        return;
      }
      if (saved.project_id) {
        await loadIssueTypes(saved.project_id);
        if (saved.issue_type_id) await loadStatuses(saved.project_id, saved.issue_type_id);
      }
    },
    [loadIssueTypes, loadStatuses],
  );

  const reloadActivity = useCallback(async () => {
    try {
      setEvents(await getJiraIncidentEvents(EVENTS_SHOWN));
      setEventsFailed(false);
    } catch {
      setEventsFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await getJiraIncidentsConfig();
        if (cancelled) return;
        setView(saved);
        setForm(fromView(saved));
        void loadPickers(saved);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    getAllProjects()
      .then((res) => {
        const list = (res?.data ?? []) as Array<{ id: number; project_title: string }>;
        if (!cancelled) setUseCases(list.map((p) => ({ _id: p.id, name: p.project_title })));
      })
      .catch(() => {
        if (!cancelled) setUseCases([]);
      });
    void reloadActivity();
    return () => {
      cancelled = true;
      if (labelTimer.current) clearTimeout(labelTimer.current);
    };
  }, [isAdmin, loadPickers, reloadActivity]);

  const update = (patch: Partial<FormState>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  const handleProjectChange = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    update({ project_id: projectId, project_key: project?.key ?? "", issue_type_id: "" });
    setIssueTypes([]);
    setStatuses([]);
    if (projectId) void loadIssueTypes(projectId);
  };

  const handleIssueTypeChange = (issueTypeId: string) => {
    update({ issue_type_id: issueTypeId });
    setStatuses([]);
    if (form?.project_id && issueTypeId) void loadStatuses(form.project_id, issueTypeId);
  };

  const handleLabelChange = (label: string) => {
    update({ label });
    if (labelTimer.current) clearTimeout(labelTimer.current);
    const query = label.trim();
    if (!query || !view?.has_api_token) {
      setLabelSuggestions([]);
      return;
    }
    labelTimer.current = setTimeout(() => {
      getJiraLabels(query)
        .then((labels) => setLabelSuggestions(labels.slice(0, MAX_LABEL_SUGGESTIONS)))
        .catch(() => setLabelSuggestions([]));
    }, LABEL_DEBOUNCE_MS);
  };

  const handleTestConnection = async () => {
    if (!form) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testJiraIncidentsConnection({
        site_url: form.site_url.trim(),
        email: form.email.trim(),
        ...(form.api_token.trim() ? { api_token: form.api_token.trim() } : {}),
        ...(form.project_id ? { project_id: form.project_id } : {}),
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: getApiErrorReason(err) ?? "Could not test the connection to Jira.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form || !view) return;
    setSaveMessage(null);
    const found = validateForm(form, {
      hasStoredToken: view.has_api_token,
      storedSiteUrl: view.site_url,
      storedEmail: view.email,
      statusIds: statuses.map((s) => s.id),
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const saved = await saveJiraIncidentsConfig(toInput(form));
      const connectionWasMissing = !view.has_api_token;
      setView(saved);
      // Take the site URL and email as the server stored them (it normalises the
      // URL), so the next save doesn't see them as changed and ask for the token.
      setForm((f) =>
        f
          ? {
              ...f,
              api_token: "",
              site_url: saved.site_url ?? f.site_url,
              email: saved.email ?? f.email,
            }
          : f,
      );
      setSaveMessage({ ok: true, text: "Settings saved." });
      if (connectionWasMissing) void loadPickers(saved);
    } catch (err) {
      setSaveMessage({ ok: false, text: getApiErrorReason(err) ?? "Could not save the settings." });
    } finally {
      setSaving(false);
    }
  };

  const statusOutOptions = useMemo(
    () => [
      ...statuses.map((s) => ({ _id: s.id, name: s.name })),
      { _id: DONT_CHANGE_JIRA, name: "Don't change Jira" },
    ],
    [statuses],
  );

  if (!isAdmin) return null;
  if (loadFailed) {
    return (
      <Alert severity="error" sx={{ fontSize: "13px" }}>
        Could not load the Jira incidents settings. Reload the page to try again.
      </Alert>
    );
  }
  if (!view || !form) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: "16px" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const connected = view.has_api_token && !!view.site_url;
  const outValue = Object.fromEntries(
    Object.entries(form.status_map_out).map(([k, v]) => [k, v ?? DONT_CHANGE_JIRA]),
  );

  return (
    <Stack sx={{ gap: "24px" }}>
      <Alert severity="info" sx={{ fontSize: "13px" }}>
        <Stack sx={{ gap: "4px" }}>
          <span>
            Only issues created in Jira after this is set up are imported. VerifyWise doesn&apos;t
            create Jira issues.
          </span>
          <span>
            After import, only status stays in sync, in both directions. Later changes to other Jira
            fields aren&apos;t copied.
          </span>
          <span>
            If a Jira status move needs a field such as Resolution, VerifyWise can&apos;t make it.
            Those incidents show an error, and you can change the status in Jira.
          </span>
        </Stack>
      </Alert>

      <Section title="Connection">
        <VWField
          id="jira-incidents-site-url"
          label="Jira site URL"
          isRequired
          placeholder="https://your-company.atlassian.net"
          value={form.site_url}
          onChange={(e) => update({ site_url: e.target.value })}
          error={errors.site_url}
        />
        <VWField
          id="jira-incidents-email"
          label="Service account email"
          isRequired
          type="email"
          value={form.email}
          onChange={(e) => update({ email: e.target.value })}
          error={errors.email}
        />
        <Box>
          <VWField
            id="jira-incidents-api-token"
            label="API token"
            isRequired={!view.has_api_token}
            type="password"
            placeholder={view.has_api_token ? "Stored. Enter a new token to replace it" : undefined}
            value={form.api_token}
            onChange={(e) => update({ api_token: e.target.value })}
            error={errors.api_token}
          />
          <Caption>
            Create a classic API token for the service account at id.atlassian.com. Scoped tokens
            aren&apos;t supported.
          </Caption>
        </Box>
        <Box>
          <CustomizableButton
            variant="outlined"
            text="Test connection"
            onClick={handleTestConnection}
            loading={testing}
            isDisabled={testing}
            sx={CONTROL_HEIGHT_SX}
          />
        </Box>
        {testResult && (
          <Alert severity={testResult.success ? "success" : "error"} sx={{ fontSize: "13px" }}>
            {testResult.message}
          </Alert>
        )}
      </Section>

      <Divider />

      <Section title="Which issues to import">
        {!connected && <Caption>Save the connection to choose a Jira project.</Caption>}
        {pickerError && (
          <Alert severity="error" sx={{ fontSize: "13px" }} onClose={() => setPickerError(null)}>
            {pickerError}
          </Alert>
        )}
        <VWSelect
          id="jira-incidents-project"
          label="Jira project"
          isRequired
          placeholder="Choose a project"
          value={form.project_id}
          items={projects.map((p) => ({ _id: p.id, name: `${p.name} (${p.key})` }))}
          onChange={(e) => handleProjectChange(String(e.target.value))}
          disabled={!connected || projects.length === 0}
          error={errors.project_id}
        />
        <VWSelect
          id="jira-incidents-issue-type"
          label="Issue type"
          isRequired
          placeholder="Choose an issue type"
          value={form.issue_type_id}
          items={issueTypes.map((t) => ({ _id: t.id, name: t.name }))}
          onChange={(e) => handleIssueTypeChange(String(e.target.value))}
          disabled={!form.project_id || issueTypes.length === 0}
          error={errors.issue_type_id}
        />
        <Box>
          <VWField
            id="jira-incidents-label"
            label="Label"
            isOptional
            value={form.label}
            onChange={(e) => handleLabelChange(e.target.value)}
          />
          <Caption>Import only issues with this label. Leave empty to import every issue.</Caption>
          {labelSuggestions.length > 0 && (
            <Stack direction="row" sx={{ gap: "8px", flexWrap: "wrap", mt: "8px" }}>
              {labelSuggestions.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  size="small"
                  onClick={() => {
                    update({ label });
                    setLabelSuggestions([]);
                  }}
                  sx={{ borderRadius: "4px" }}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Section>

      <Divider />

      <Section title="Status mapping">
        {statuses.length === 0 ? (
          <Caption>Choose a project and issue type to map statuses.</Caption>
        ) : (
          <>
            <Typography variant="body2" fontWeight={500} fontSize={13}>
              Jira to VerifyWise
            </Typography>
            <MappingTable
              sourceHeader="Jira status"
              targetHeader="VerifyWise status"
              idPrefix="jira-incidents-map-in"
              rows={statuses.map((s) => ({ key: s.id, label: s.name }))}
              options={toItems(VW_STATUSES)}
              value={form.status_map_in}
              onChange={(key, value) =>
                update({ status_map_in: { ...form.status_map_in, [key]: value } })
              }
              error={errors.status_map_in}
            />
            <Typography variant="body2" fontWeight={500} fontSize={13}>
              VerifyWise to Jira
            </Typography>
            <MappingTable
              sourceHeader="VerifyWise status"
              targetHeader="Jira status"
              idPrefix="jira-incidents-map-out"
              rows={VW_STATUSES.map((s) => ({ key: s, label: s }))}
              options={statusOutOptions}
              value={outValue}
              onChange={(key, value) =>
                update({ status_map_out: { ...form.status_map_out, [key]: value } })
              }
            />
          </>
        )}
      </Section>

      <Divider />

      <Section title="Severity mapping">
        {priorities.length === 0 ? (
          <Caption>Save the connection to map Jira priorities.</Caption>
        ) : (
          <MappingTable
            sourceHeader="Jira priority"
            targetHeader="Severity"
            idPrefix="jira-incidents-severity"
            rows={priorities.map((p) => ({ key: p.id, label: p.name }))}
            options={toItems(SEVERITIES)}
            value={form.severity_map}
            onChange={(key, value) =>
              update({ severity_map: { ...form.severity_map, [key]: value } })
            }
          />
        )}
      </Section>

      <Divider />

      <Section title="Defaults for imported incidents">
        <VWSelect
          id="jira-incidents-use-case"
          label="Use case"
          isRequired
          placeholder="Choose a use case"
          value={form.default_project_id}
          items={useCases}
          onChange={(e) => {
            const id = Number(e.target.value);
            update({ default_project_id: Number.isInteger(id) && id > 0 ? id : "" });
          }}
          error={errors.default_project_id}
        />
        <VWSelect
          id="jira-incidents-type"
          label="Incident type"
          isRequired
          placeholder="Choose an incident type"
          value={form.default_type}
          items={toItems(INCIDENT_TYPES)}
          onChange={(e) => update({ default_type: String(e.target.value) })}
          error={errors.default_type}
        />
        <VWField
          id="jira-incidents-reporter"
          label="Reporter"
          isRequired
          value={form.default_reporter}
          onChange={(e) => update({ default_reporter: e.target.value })}
          error={errors.default_reporter}
        />
      </Section>

      <Stack sx={{ gap: "16px" }}>
        {saveMessage && (
          <Alert
            severity={saveMessage.ok ? "success" : "error"}
            sx={{ fontSize: "13px" }}
            onClose={() => setSaveMessage(null)}
          >
            {saveMessage.text}
          </Alert>
        )}
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <CustomizableButton
            text="Save"
            onClick={handleSave}
            loading={saving}
            isDisabled={saving}
            sx={CONTROL_HEIGHT_SX}
          />
        </Box>
      </Stack>

      <Divider />

      <Section title="Sync">
        {!view.readiness.ready && view.readiness.reason && (
          <Caption>{view.readiness.reason}</Caption>
        )}
        <ExtensionSyncPanel
          extensionKey="jira-incidents"
          canManage={isAdmin}
          showSyncNow={view.readiness.ready}
          persistSchedule={view.readiness.ready}
          describeCompletedRun={describeJiraIncidentsRun}
          onRunCompleted={() => {
            void reloadActivity();
          }}
          scheduleDescription="Import new Jira issues and sync status on a schedule"
          scheduleHelp="Each sync imports issues created since the last one, then syncs status both ways."
        />
      </Section>

      <Divider />

      <Section title="Sync activity">
        <SyncActivity events={events} loadFailed={eventsFailed} />
      </Section>
    </Stack>
  );
}

export default JiraIncidentsConfiguration;
