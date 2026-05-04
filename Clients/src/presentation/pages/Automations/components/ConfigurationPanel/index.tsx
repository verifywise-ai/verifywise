/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import {
  Stack,
  Typography,
  FormControl,
  Chip,
  useTheme,
  Divider,
  Box,
  Card,
  CardContent,
} from "@mui/material";
import { Settings } from "lucide-react";
import Select from "../../../../components/Inputs/Select";
import Toggle from "../../../../components/Inputs/Toggle";
import Field from "../../../../components/Inputs/Field";
import TemplateField from "../../../../components/Inputs/TemplateField";
import CustomizableMultiSelect from "../../../../components/Inputs/Select/Multi";
import {
  Trigger,
  Action,
  TriggerTemplate,
  ActionTemplate,
  ConfigurationField,
} from "../../../../../domain/types/Automation";
import useUsers from "../../../../../application/hooks/useUsers";
import {
  EUAI_REPORT_TYPES,
  ISO_REPORT_TYPES,
} from "../../../../components/Reporting/GenerateReport/constants";
import { Project, FrameworkValues } from "../../../../../application/interfaces/appStates";

interface ConfigurationPanelProps {
  selectedItem: Trigger | Action | null;
  selectedItemType: "trigger" | "action" | null;
  trigger: Trigger | null;
  triggerTemplates: TriggerTemplate[];
  actionTemplates: ActionTemplate[];
  onConfigurationChange: (configuration: Record<string, any>) => void;
  automationName?: string;
  onAutomationNameChange?: (newName: string) => void;
  projects?: Project[];
}

const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  selectedItem,
  selectedItemType,
  trigger,
  triggerTemplates,
  actionTemplates,
  onConfigurationChange,
  automationName,
  onAutomationNameChange,
  projects = [],
}) => {
  const theme = useTheme();
  const [configuration, setConfiguration] = useState<Record<string, any>>({});
  const [activeField, setActiveField] = useState<string | null>(null);
  const { users, loading: usersLoading } = useUsers();
  const bodyFieldRef = React.useRef<HTMLTextAreaElement>(null);
  const subjectFieldRef = React.useRef<HTMLInputElement>(null);

  // Get the template for the selected item
  const template = React.useMemo(() => {
    if (!selectedItem) return null;

    if (selectedItemType === "trigger") {
      const triggerTemplate = triggerTemplates.find((t) => t.type === selectedItem.type);
      // If this is a scheduled_report trigger, populate project options dynamically
      if (triggerTemplate && triggerTemplate.type === "scheduled_report") {
        const updatedTemplate = { ...triggerTemplate };
        const reportLevel =
          configuration?.reportLevel || selectedItem.configuration?.reportLevel || "project";
        const selectedFramework =
          configuration?.framework || selectedItem.configuration?.framework || 1;

        // Filter projects to only show EU AI Act projects (framework_id === 1)
        const euActProjects = Array.isArray(projects)
          ? projects.filter((project: Project) =>
              project.framework?.some((f) => f.framework_id === 1),
            )
          : [];

        // Get ISO frameworks (framework_id !== 1) from all projects
        const allFrameworks: FrameworkValues[] = Array.isArray(projects)
          ? projects
              .flatMap((p: Project) => (Array.isArray(p.framework) ? p.framework : []))
              .filter(
                (f: FrameworkValues) =>
                  typeof f?.framework_id === "number" && !!f?.name && f.framework_id !== 1,
              )
          : [];

        // Deduplicate frameworks by framework_id
        const frameworkMap = new Map<number, FrameworkValues>();
        for (const f of allFrameworks) {
          if (!frameworkMap.has(f.framework_id)) {
            frameworkMap.set(f.framework_id, f);
          }
        }
        const isoFrameworks = Array.from(frameworkMap.values());

        updatedTemplate.configurationSchema = triggerTemplate.configurationSchema.map((field) => {
          // Populate project dropdown with EU AI Act projects only
          if (field.key === "projectId") {
            return {
              ...field,
              options: euActProjects.map((project) => ({
                value: project.id.toString(),
                label: project.project_title || `Project ${project.id}`,
              })),
            };
          }

          // Populate framework dropdown with ISO frameworks only
          if (field.key === "framework") {
            return {
              ...field,
              options: isoFrameworks.map((framework) => ({
                value: framework.framework_id,
                label: framework.name,
              })),
            };
          }

          // Filter report types based on framework selection
          if (field.key === "reportType") {
            // For project level (always EU AI Act), use EUAI_REPORT_TYPES
            // For organization level (ISO frameworks), use ISO_REPORT_TYPES
            const reportTypes =
              reportLevel === "organization" || selectedFramework !== 1
                ? ISO_REPORT_TYPES
                : EUAI_REPORT_TYPES;

            return {
              ...field,
              options: reportTypes.map((type) => ({
                value: type,
                label: type,
              })),
            };
          }

          return field;
        });
        return updatedTemplate;
      }
      return triggerTemplate;
    } else {
      return actionTemplates.find((a) => a.type === selectedItem.type);
    }
  }, [selectedItem, selectedItemType, triggerTemplates, actionTemplates, projects, configuration]);

  // Initialize configuration when selectedItem changes
  useEffect(() => {
    if (selectedItem) {
      setConfiguration(selectedItem.configuration || {});
    }
  }, [selectedItem]);

  // Handle configuration field changes
  const handleFieldChange = (fieldKey: string, value: any) => {
    let newConfiguration = { ...configuration, [fieldKey]: value };

    // If report level changes, clear the report type selection
    if (fieldKey === "reportLevel" && trigger?.type === "scheduled_report") {
      newConfiguration = { ...newConfiguration, reportType: [] };
    }

    // If framework changes, clear the report type selection
    if (fieldKey === "framework" && trigger?.type === "scheduled_report") {
      newConfiguration = { ...newConfiguration, reportType: [] };
    }

    setConfiguration(newConfiguration);
    onConfigurationChange(newConfiguration);
  };

  // Handle variable insertion
  const handleVariableInsert = (variable: string) => {
    // Default to body field if no field is active
    const targetField = activeField || "body";
    const currentValue = configuration[targetField] || "";

    // Get the ref for the active field
    let fieldRef: HTMLInputElement | HTMLTextAreaElement | null = null;
    if (targetField === "body") {
      fieldRef = bodyFieldRef.current;
    } else if (targetField === "subject") {
      fieldRef = subjectFieldRef.current;
    }

    if (fieldRef) {
      // Get cursor position
      const cursorPosition = fieldRef.selectionStart || currentValue.length;

      // Insert variable at cursor position
      const newValue =
        currentValue.slice(0, cursorPosition) + variable + currentValue.slice(cursorPosition);

      handleFieldChange(targetField, newValue);

      // Set focus back to field and position cursor after inserted variable
      setTimeout(() => {
        fieldRef!.focus();
        const newCursorPosition = cursorPosition + variable.length;
        fieldRef!.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);
    } else {
      // Fallback: append to the end
      handleFieldChange(targetField, currentValue + (currentValue ? " " : "") + variable);
    }
  };

  // Render different field types
  const renderField = (field: ConfigurationField) => {
    const value = configuration[field.key] ?? "";

    // For scheduled_report trigger, conditionally show fields based on reportLevel
    if (trigger?.type === "scheduled_report") {
      // Hide projectId field if reportLevel is 'organization'
      if (field.key === "projectId" && configuration["reportLevel"] === "organization") {
        return null;
      }

      // Hide framework field if reportLevel is 'project'
      if (field.key === "framework" && configuration["reportLevel"] === "project") {
        return null;
      }

      // Conditionally show day fields based on frequency
      if (field.key === "dayOfWeek" && configuration["frequency"] !== "weekly") {
        return null; // Only show dayOfWeek for weekly frequency
      }
      if (field.key === "dayOfMonth" && configuration["frequency"] !== "monthly") {
        return null; // Only show dayOfMonth for monthly frequency
      }
      // Hide hour and minute for weekly and monthly frequencies
      if (
        (field.key === "hour" || field.key === "minute") &&
        (configuration["frequency"] === "weekly" || configuration["frequency"] === "monthly")
      ) {
        return null;
      }
    }

    switch (field.type) {
      case "text":
      case "textarea": {
        // Check if this is a message/content field that should have multiple rows (excluding subject)
        const isMessageField =
          field.type === "textarea" ||
          field.key.toLowerCase().includes("message") ||
          field.key.toLowerCase().includes("body") ||
          field.key.toLowerCase().includes("content") ||
          field.key === "body" ||
          field.key === "message" ||
          field.key === "reminderMessage" ||
          field.label.toLowerCase().includes("message") ||
          field.label.toLowerCase().includes("body") ||
          field.label.toLowerCase().includes("content");

        // Check if this is a template field (subject or body for email)
        const isTemplateField = field.key === "subject" || field.key === "body";

        // Use CustomizableMultiSelect for the "to" field (email recipients)
        if (field.key === "to" && selectedItemType === "action") {
          // Convert value to array format expected by CustomizableMultiSelect
          const selectValue = Array.isArray(value)
            ? value
            : value && value !== ""
              ? value
                  .split(",")
                  .map((v: string | number) => v.toString().trim())
                  .filter((v: string | number) => v)
              : [];

          // Transform users to have _id field expected by CustomizableMultiSelect
          const usersWithId = users.map((user) => ({
            ...user,
            _id: user.id, // Map id to _id for the component
          }));

          return (
            <CustomizableMultiSelect
              key={field.key}
              label={field.label}
              required={field.required}
              error={
                !field.required || selectValue.length > 0
                  ? undefined
                  : "At least one recipient is required"
              }
              value={selectValue}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              items={usersWithId}
              placeholder={usersLoading ? "Loading users..." : "Search and select users..."}
              sx={{ width: "100%" }}
              isHidden={false}
            />
          );
        }

        // Determine which ref to use
        const inputRef =
          field.key === "body"
            ? (bodyFieldRef as any)
            : field.key === "subject"
              ? subjectFieldRef
              : undefined;

        // Use TemplateField for subject and body with variable autocomplete
        if (isTemplateField && selectedItemType === "action") {
          // Check if this is the body field and trigger is set to "Updated" - if so, disable editing
          const isUpdateTrigger = trigger?.configuration?.changeType === "Updated";
          const isBodyField = field.key === "body";
          const shouldDisableBody = isUpdateTrigger && isBodyField;

          return (
            <TemplateField
              key={field.key}
              id={field.key}
              label={field.label}
              type={isMessageField ? "description" : "text"}
              value={value}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              onFocus={() => setActiveField(field.key)}
              placeholder={field.placeholder}
              rows={isMessageField ? 4 : undefined}
              isRequired={field.required}
              variables={templateVariables}
              ref={inputRef}
              disabled={shouldDisableBody}
            />
          );
        }

        // Use regular Field for other fields
        return (
          <Field
            key={field.key}
            id={field.key}
            label={field.label}
            type={isMessageField ? "description" : "text"}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            onFocus={() => setActiveField(field.key)}
            placeholder={field.placeholder}
            rows={isMessageField ? 4 : undefined}
            isRequired={field.required}
            ref={inputRef}
          />
        );
      }

      case "select":
        return (
          <Select
            key={field.key}
            id={field.key}
            label={field.label}
            value={value}
            items={field.options?.map((opt) => ({ _id: opt.value, name: opt.label })) || []}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            isRequired={field.required}
          />
        );

      case "multiselect":
        return (
          <FormControl key={field.key} fullWidth>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
              {field.label}{" "}
              {field.required && <span style={{ color: theme.palette.error.main }}>*</span>}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {field.options?.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  clickable
                  variant={
                    Array.isArray(value) && value.includes(option.value) ? "filled" : "outlined"
                  }
                  onClick={() => {
                    const currentArray = Array.isArray(value) ? value : [];
                    const newArray = currentArray.includes(option.value)
                      ? currentArray.filter((v) => v !== option.value)
                      : [...currentArray, option.value];
                    handleFieldChange(field.key, newArray);
                  }}
                  sx={{
                    backgroundColor:
                      Array.isArray(value) && value.includes(option.value)
                        ? theme.palette.primary.main
                        : "transparent",
                    color:
                      Array.isArray(value) && value.includes(option.value)
                        ? theme.palette.primary.contrastText
                        : theme.palette.text.primary,
                    borderRadius: "4px",
                    padding: "4px 4px",
                    height: "auto",
                  }}
                />
              ))}
            </Stack>
            {field.helpText && (
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
                {field.helpText}
              </Typography>
            )}
          </FormControl>
        );

      case "number":
        return (
          <Field
            key={field.key}
            id={field.key}
            label={field.label}
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.key, Number(e.target.value))}
            placeholder={field.placeholder}
            isRequired={field.required}
            min={field.validation?.min}
            max={field.validation?.max}
          />
        );

      case "boolean":
        return (
          <Stack key={field.key} direction="row" alignItems="center" spacing={1}>
            <Stack flex={1}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {field.label}
              </Typography>
              {field.helpText && (
                <Typography variant="caption" color="textSecondary">
                  {field.helpText}
                </Typography>
              )}
            </Stack>
            <Toggle
              checked={Boolean(value)}
              onChange={(e) => handleFieldChange(field.key, e.target.checked)}
            />
          </Stack>
        );

      default:
        return null;
    }
  };

  // Get trigger-specific template variables
  const getTemplateVariables = () => {
    if (!trigger) return [];

    // Check if this is an update trigger
    const isUpdateTrigger = trigger.configuration?.changeType === "Updated";

    // Helper function to add old_* versions of variables for update triggers
    const addOldVariables = (variables: Array<{ var: string; desc: string }>) => {
      if (!isUpdateTrigger) return variables;

      const withOldVariables: Array<{ var: string; desc: string }> = [];

      variables.forEach((item) => {
        // Add the current/new variable
        withOldVariables.push(item);

        // Add the old_ version (skip date_and_time and other non-entity fields)
        if (!item.var.includes("date_and_time")) {
          const oldVar = item.var.replace("{{", "{{old_");
          withOldVariables.push({
            var: oldVar,
            desc: `${item.desc} (before update)`,
          });
        }
      });

      return withOldVariables;
    };

    // Common variables available for all triggers
    const commonVariables = [{ var: "{{date_and_time}}", desc: "Date and time of the event" }];

    // Add changes_summary for update triggers
    const updateSpecificVariables = isUpdateTrigger
      ? [
          {
            var: "{{changes_summary}}",
            desc: "Auto-generated summary of changed fields (shows old → new for changed fields, current value for unchanged)",
          },
        ]
      : [];

    // Common vendor variables
    const vendorVariables = [
      { var: "{{vendor.name}}", desc: "Name of the vendor" },
      { var: "{{vendor.provides}}", desc: "Services/products the vendor provides" },
      { var: "{{vendor.website}}", desc: "Vendor website URL" },
      { var: "{{vendor.contact}}", desc: "Vendor contact person name" },
    ];

    // Common model variables
    const modelVariables = [
      { var: "{{model.provider}}", desc: "Model provider (e.g., OpenAI, Anthropic)" },
      { var: "{{model.name}}", desc: "Model name" },
      { var: "{{model.version}}", desc: "Model version" },
      { var: "{{model.provider_model}}", desc: "Full provider model string" },
      { var: "{{model.approver}}", desc: "Person who approved the model" },
      { var: "{{model.capabilities}}", desc: "Model capabilities" },
      { var: "{{model.security_assessment}}", desc: "Security assessment status (Yes/No)" },
      { var: "{{model.status}}", desc: "Model status (Pending/Approved/Restricted)" },
      { var: "{{model.status_date}}", desc: "Status date" },
      { var: "{{model.reference_link}}", desc: "Reference link" },
      { var: "{{model.biases}}", desc: "Known biases" },
      { var: "{{model.limitations}}", desc: "Model limitations" },
      { var: "{{model.hosting_provider}}", desc: "Hosting provider" },
      { var: "{{model.securityAssessmentData}}", desc: "security assessment data" },
      { var: "{{model.created_at}}", desc: "Model creation date" },
    ];

    // Common project variables
    const projectVariables = [
      { var: "{{project.title}}", desc: "Project title" },
      { var: "{{project.goal}}", desc: "Project goal" },
      { var: "{{project.owner}}", desc: "Project owner" },
      { var: "{{project.start_date}}", desc: "Project start date" },
      { var: "{{project.ai_risk_classification}}", desc: "AI risk classification" },
      { var: "{{project.type_of_high_risk_role}}", desc: "Type of high-risk role" },
      { var: "{{project.status}}", desc: "Project status" },
    ];

    // Common task variables
    const taskVariables = [
      { var: "{{task.title}}", desc: "Task title" },
      { var: "{{task.description}}", desc: "Task description" },
      { var: "{{task.creator}}", desc: "Task creator" },
      { var: "{{task.assignees}}", desc: "Task assignees" },
      { var: "{{task.due_date}}", desc: "Task due date" },
      { var: "{{task.priority}}", desc: "Task priority" },
      { var: "{{task.status}}", desc: "Task status" },
      { var: "{{task.categories}}", desc: "Task categories" },
    ];

    // Common risk variables
    const riskVariables = [
      { var: "{{risk.name}}", desc: "Risk name" },
      { var: "{{risk.description}}", desc: "Risk description" },
      { var: "{{risk.owner}}", desc: "Risk owner" },
      { var: "{{risk.ai_lifecycle_phase}}", desc: "AI lifecycle phase" },
      { var: "{{risk.category}}", desc: "Risk category" },
      { var: "{{risk.likelihood}}", desc: "Likelihood" },
      { var: "{{risk.severity}}", desc: "Severity" },
      { var: "{{risk.risk_level}}", desc: "Risk level (auto-calculated)" },
      { var: "{{risk.current_risk_level}}", desc: "Current risk level" },
      { var: "{{risk.mitigation_status}}", desc: "Mitigation status" },
      { var: "{{risk.deadline}}", desc: "Mitigation deadline" },
      { var: "{{risk.approval_status}}", desc: "Approval status" },
    ];

    // Common training variables
    const trainingVariables = [
      { var: "{{training.name}}", desc: "Training name" },
      { var: "{{training.description}}", desc: "Training description" },
      { var: "{{training.duration}}", desc: "Training duration" },
      { var: "{{training.provider}}", desc: "Training provider" },
      { var: "{{training.department}}", desc: "Department" },
      { var: "{{training.status}}", desc: "Training status" },
      { var: "{{training.number_of_people}}", desc: "Number of people" },
    ];

    // Common policy variables
    const policyVariables = [
      { var: "{{policy.title}}", desc: "Policy title" },
      { var: "{{policy.content}}", desc: "Policy content" },
      { var: "{{policy.status}}", desc: "Policy status" },
      { var: "{{policy.tags}}", desc: "Policy tags" },
      { var: "{{policy.next_review_date}}", desc: "Next review date" },
      { var: "{{policy.author}}", desc: "Policy author" },
      { var: "{{policy.reviewers}}", desc: "Assigned reviewers" },
    ];

    // Common incident variables
    const incidentVariables = [
      { var: "{{incident.ai_project}}", desc: "AI Project" },
      { var: "{{incident.type}}", desc: "Incident type" },
      { var: "{{incident.severity}}", desc: "Severity level" },
      { var: "{{incident.status}}", desc: "Incident status" },
      { var: "{{incident.occurred_date}}", desc: "Date occurred" },
      { var: "{{incident.date_detected}}", desc: "Date detected" },
      { var: "{{incident.reporter}}", desc: "Reporter name" },
      { var: "{{incident.categories_of_harm}}", desc: "Categories of harm" },
      { var: "{{incident.affected_persons_groups}}", desc: "Affected persons/groups" },
      { var: "{{incident.description}}", desc: "Incident description" },
      { var: "{{incident.relationship_causality}}", desc: "Relationship/causality" },
      { var: "{{incident.immediate_mitigations}}", desc: "Immediate mitigations" },
      { var: "{{incident.planned_corrective_actions}}", desc: "Planned corrective actions" },
      { var: "{{incident.model_system_version}}", desc: "Model/system version" },
      { var: "{{incident.approval_status}}", desc: "Approval status" },
      { var: "{{incident.approved_by}}", desc: "Approved by" },
      { var: "{{incident.approval_date}}", desc: "Approval date" },
      { var: "{{incident.approval_notes}}", desc: "Approval notes" },
      { var: "{{incident.interim_report}}", desc: "Interim report flag" },
    ];

    switch (trigger.type) {
      case "vendor_updated":
        return [
          ...updateSpecificVariables,
          ...addOldVariables(vendorVariables),
          ...commonVariables,
        ];

      case "model_updated":
        return [...updateSpecificVariables, ...addOldVariables(modelVariables), ...commonVariables];

      case "project_updated":
        return [
          ...updateSpecificVariables,
          ...addOldVariables(projectVariables),
          ...commonVariables,
        ];

      case "task_updated":
        return [...updateSpecificVariables, ...addOldVariables(taskVariables), ...commonVariables];

      case "risk_updated":
        return [...updateSpecificVariables, ...addOldVariables(riskVariables), ...commonVariables];

      case "training_updated":
        return [
          ...updateSpecificVariables,
          ...addOldVariables(trainingVariables),
          ...commonVariables,
        ];

      case "policy_updated":
        return [
          ...updateSpecificVariables,
          ...addOldVariables(policyVariables),
          ...commonVariables,
        ];

      case "incident_updated":
        return [
          ...updateSpecificVariables,
          ...addOldVariables(incidentVariables),
          ...commonVariables,
        ];

      case "vendor_review_date_approaching":
        return [
          ...vendorVariables,
          { var: "{{vendor.review_date}}", desc: "Scheduled review date" },
          { var: "{{vendor.reviewer}}", desc: "Assigned reviewer" },
          ...commonVariables,
        ];

      case "scheduled_report": {
        // Base variables available for all reports
        const baseReportVariables = [
          { var: "{{report.type}}", desc: "Type of report being generated" },
          { var: "{{schedule.frequency}}", desc: "Report frequency (daily/weekly/monthly)" },
        ];

        // Project-level variables (only if project-level report is selected)
        const projectLevelVariables =
          trigger.configuration?.reportLevel !== "organization"
            ? [
                { var: "{{project.title}}", desc: "Project title" },
                { var: "{{project.owner}}", desc: "Project owner" },
                { var: "{{project.goal}}", desc: "Project goal" },
                { var: "{{project.start_date}}", desc: "Project start date" },
                { var: "{{project.ai_risk_classification}}", desc: "AI risk classification" },
                { var: "{{project.status}}", desc: "Project status" },
              ]
            : [];

        // Organization-level variables
        const orgVariables = [{ var: "{{organization.name}}", desc: "Organization name" }];

        return [
          ...baseReportVariables,
          ...projectLevelVariables,
          ...orgVariables,
          ...commonVariables,
        ];
      }

      default:
        return commonVariables;
    }
  };

  const templateVariables = getTemplateVariables();

  if (!selectedItem || !template) {
    return (
      <Stack
        sx={{
          height: "100%",
          backgroundColor: "transparent",
        }}
      >
        {/* Automation Name Field - Always show at top when automation exists */}
        {automationName !== undefined && onAutomationNameChange && (
          <Box sx={{ p: 4, pb: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
                Automation name
                <Typography component="span" ml={1} color={theme.palette.error.text}>
                  *
                </Typography>
              </Typography>
              <Field
                id="automation-name"
                type="text"
                value={automationName}
                onChange={(e) => onAutomationNameChange(e.target.value)}
                placeholder="Enter automation name"
              />
            </Stack>
          </Box>
        )}

        <Stack
          sx={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            p: 4,
            textAlign: "center",
          }}
        >
          <Settings size={48} strokeWidth={1} color={theme.palette.primary.main} />
          <Typography variant="h6" color="textSecondary" sx={{ mt: 2, fontSize: "13px" }}>
            Configure automation
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.disabled }}>
            Select a trigger or action to configure its settings
          </Typography>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack
      sx={{
        height: "100%",
        backgroundColor: "transparent",
      }}
    >
      {/* Automation Name Field - Always show at top */}
      {automationName !== undefined && onAutomationNameChange && (
        <Box
          sx={{
            px: 2,
            py: 2,
            borderLeft: "16px solid transparent",
            borderRight: "16px solid transparent",
          }}
        >
          <Stack spacing={2}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
              Automation name
              <Typography component="span" ml={1} color={theme.palette.error.text}>
                *
              </Typography>
            </Typography>
            <Field
              id="automation-name"
              type="text"
              value={automationName}
              onChange={(e) => onAutomationNameChange(e.target.value)}
              placeholder="Enter automation name"
            />
          </Stack>
        </Box>
      )}

      {/* Content */}
      <Stack
        sx={{
          flex: 1,
          overflow: "auto",
          pt: automationName !== undefined ? 2 : 4,
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-track": {
            background: "transparent",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "transparent",
            borderRadius: "4px",
            backgroundClip: "padding-box",
          },
          "&:hover::-webkit-scrollbar-thumb": {
            background: "rgba(0, 0, 0, 0.3)",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: "rgba(0, 0, 0, 0.4)",
          },
        }}
      >
        {/* Configuration Fields */}
        <Box sx={{ mx: 0, my: 2 }}>
          {template.configurationSchema.length > 0 && <Divider />}
          <Box
            sx={{
              px: 2,
              py: 2,
              borderLeft: "16px solid transparent",
              borderRight: "16px solid transparent",
            }}
          >
            {template.configurationSchema.length > 0 ? (
              <Stack spacing={3}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600, textTransform: "uppercase" }}
                >
                  Settings
                </Typography>

                {template.configurationSchema.map((field) => {
                  const renderedField = renderField(field);
                  // Only render the Stack if the field is actually visible
                  if (!renderedField) return null;

                  // For scheduled_report trigger, add dividers before Report Type(s) and Frequency fields
                  const shouldAddDividerBefore =
                    trigger?.type === "scheduled_report" &&
                    (field.key === "reportType" || field.key === "frequency");

                  return (
                    <React.Fragment key={field.key}>
                      {shouldAddDividerBefore && <Divider sx={{ my: 1 }} />}
                      <Stack spacing={1}>
                        {renderedField}
                        {field.helpText &&
                          field.type !== "boolean" &&
                          field.type !== "multiselect" && (
                            <Typography variant="caption" color="textSecondary">
                              {field.helpText}
                            </Typography>
                          )}
                      </Stack>
                    </React.Fragment>
                  );
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
                No configuration options available for this {selectedItemType}.
              </Typography>
            )}
          </Box>
        </Box>

        {/* Template Variables Helper */}
        {selectedItemType === "action" && templateVariables.length > 0 && (
          <>
            <Box sx={{ my: 2 }}>
              <Divider />
            </Box>
            <Box sx={{ mx: 2, my: 2 }}>
              <Box
                sx={{
                  px: 2,
                  py: 2,
                  borderLeft: "16px solid transparent",
                  borderRight: "16px solid transparent",
                }}
              >
                <Stack spacing={2}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, textTransform: "uppercase" }}
                  >
                    Available Variables
                  </Typography>

                  <Typography variant="body2" color="textSecondary" sx={{ fontSize: 12 }}>
                    Use these variables in your email subject and body to insert dynamic content:
                    Click any variable to insert it into{" "}
                    {activeField === "subject" ? "the subject field" : "the email body"} (currently{" "}
                    {activeField || "body"})
                  </Typography>

                  <Stack spacing={1.5}>
                    {templateVariables.map((item) => (
                      <Card
                        key={item.var}
                        variant="outlined"
                        sx={{
                          cursor: "pointer",
                          "&:hover": {
                            backgroundColor: theme.palette.action.hover,
                            borderColor: theme.palette.primary.main,
                          },
                          transition: "all 0.2s ease-in-out",
                        }}
                        onClick={() => handleVariableInsert(item.var)}
                      >
                        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                          <Stack spacing={0.5}>
                            <Typography
                              sx={{
                                fontSize: 11,
                                fontFamily: "monospace",
                                fontWeight: 600,
                                color: theme.palette.primary.main,
                              }}
                            >
                              {item.var}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="textSecondary"
                              sx={{ fontSize: 10 }}
                            >
                              {item.desc}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                </Stack>
              </Box>
            </Box>
          </>
        )}
      </Stack>
    </Stack>
  );
};

export default ConfigurationPanel;
