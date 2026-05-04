import { TriggerTemplate, ActionTemplate } from "../../../../domain/types/Automation";

export const mockTriggerTemplates: TriggerTemplate[] = [
  {
    type: "vendor_updated",
    name: "When a vendor is changed",
    description: "Triggered when a vendor is changed",
    category: "vendor",
    icon: "Building",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "model_updated",
    name: "When a model is changed",
    description: "Triggered when a model is changed",
    category: "project",
    icon: "List",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "project_updated",
    name: "When a project is changed",
    description: "Triggered when a project is changed",
    category: "project",
    icon: "FolderTree",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "task_updated",
    name: "When a task is changed",
    description: "Triggered when a task is changed",
    category: "task",
    icon: "CheckSquare",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "risk_updated",
    name: "When a risk is changed",
    description: "Triggered when a risk is changed",
    category: "risk",
    icon: "AlertTriangle",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "training_updated",
    name: "When a training is changed",
    description: "Triggered when a training is changed",
    category: "training",
    icon: "GraduationCap",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "policy_updated",
    name: "When a policy is changed",
    description: "Triggered when a policy is changed",
    category: "policy",
    icon: "Shield",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "incident_updated",
    name: "When an incident is changed",
    description: "Triggered when an incident is changed",
    category: "incident",
    icon: "AlertCircle",
    defaultConfiguration: {
      changeType: "Added",
    },
    configurationSchema: [
      {
        key: "changeType",
        label: "Type of Change",
        type: "select",
        required: true,
        options: [
          { value: "Added", label: "Added" },
          { value: "Updated", label: "Updated" },
          { value: "Deleted", label: "Deleted" },
        ],
        helpText: "Select the type of change that triggers this automation",
      },
    ],
  },
  {
    type: "vendor_review_date_approaching",
    name: "When a vendor review date is approaching",
    description: "Triggered when a vendor review date is approaching",
    category: "vendor",
    icon: "Calendar",
    defaultConfiguration: {
      daysBefore: 7,
    },
    configurationSchema: [
      {
        key: "daysBefore",
        label: "Days Before Review Date",
        type: "select",
        required: true,
        options: [
          { value: 1, label: "1 day" },
          { value: 3, label: "3 days" },
          { value: 7, label: "7 days" },
          { value: 14, label: "14 days" },
          { value: 30, label: "30 days" },
        ],
        helpText: "How many days before the review date should the automation trigger?",
      },
    ],
  },
  {
    type: "scheduled_report",
    name: "Schedule a Report",
    description: "Generate and email reports on a recurring schedule",
    category: "reporting",
    icon: "BarChart3",
    defaultConfiguration: {
      reportLevel: "project",
      projectId: "",
      framework: 1,
      reportType: [],
      frequency: "weekly",
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      dayOfMonth: 1,
    },
    configurationSchema: [
      {
        key: "reportLevel",
        label: "Report Level",
        type: "select",
        required: true,
        options: [
          { value: "project", label: "Project-Level Reports (EU AI Act)" },
          { value: "organization", label: "Organization-Level Reports (ISO)" },
        ],
        helpText:
          "Choose whether to generate EU AI Act project reports or ISO organization reports",
      },
      {
        key: "projectId",
        label: "Project",
        type: "select",
        required: true,
        options: [], // Will be populated dynamically from EU AI Act projects
        helpText: "Select the EU AI Act project to generate reports for",
      },
      {
        key: "framework",
        label: "Framework",
        type: "select",
        required: true,
        options: [], // Will be populated dynamically from ISO frameworks
        helpText: "Select the ISO framework to generate reports for",
      },
      {
        key: "reportType",
        label: "Report Type(s)",
        type: "multiselect",
        required: true,
        options: [], // Will be populated dynamically based on framework selection
        helpText: "Select one or more report types to generate",
      },
      {
        key: "frequency",
        label: "Frequency",
        type: "select",
        required: true,
        options: [
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
        ],
        helpText: "How often should the report be generated and sent",
      },
      {
        key: "hour",
        label: "Hour (24-hour format)",
        type: "number",
        required: true,
        placeholder: "9",
        helpText: "Hour of the day to send the report (0-23)",
      },
      {
        key: "minute",
        label: "Minute",
        type: "number",
        required: true,
        placeholder: "0",
        helpText: "Minute of the hour to send the report (0-59)",
      },
      {
        key: "dayOfWeek",
        label: "Day of Week (for Weekly)",
        type: "select",
        required: false,
        options: [
          { value: 0, label: "Sunday" },
          { value: 1, label: "Monday" },
          { value: 2, label: "Tuesday" },
          { value: 3, label: "Wednesday" },
          { value: 4, label: "Thursday" },
          { value: 5, label: "Friday" },
          { value: 6, label: "Saturday" },
        ],
        helpText: "Day of the week for weekly reports (only used if frequency is Weekly)",
      },
      {
        key: "dayOfMonth",
        label: "Day of Month (for Monthly)",
        type: "number",
        required: false,
        placeholder: "1",
        validation: {
          min: 1,
          max: 30,
        },
        helpText: "Day of the month for monthly reports (1-30, only used if frequency is Monthly)",
      },
    ],
  },
];

export const mockActionTemplates: ActionTemplate[] = [
  {
    type: "send_email",
    name: "Send Email Notification",
    description: "Sends an email to specified recipients",
    category: "notification",
    icon: "Mail",
    defaultConfiguration: {
      to: [],
      subject: "Notification",
      body: "This is an automated notification.",
      replacements: {},
    },
    configurationSchema: [
      {
        key: "to",
        label: "Recipients",
        type: "textarea",
        required: true,
        placeholder: "Enter email addresses (comma-separated)",
        helpText: "Enter one or more email addresses separated by commas",
      },
      {
        key: "subject",
        label: "Email Subject",
        type: "text",
        required: true,
        placeholder: "Enter email subject",
        helpText: "Use {{variable_name}} for dynamic content",
      },
      {
        key: "body",
        label: "Email Body",
        type: "textarea",
        required: true,
        placeholder: "Enter email content",
        helpText:
          "Use {{variable_name}} for dynamic content. Available variables depend on the trigger.",
      },
    ],
    compatibleTriggers: [
      "vendor_updated",
      "model_updated",
      "project_updated",
      "task_updated",
      "risk_updated",
      "training_updated",
      "policy_updated",
      "incident_updated",
      "vendor_review_date_approaching",
      "scheduled_report",
    ],
  },
];
