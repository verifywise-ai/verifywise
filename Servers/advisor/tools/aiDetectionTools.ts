export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_ai_detection_scans",
      description:
        "Retrieve a list of AI Detection scans with optional status filtering. Returns scan records with triggered-by user info, pagination support, and total count. Use this to browse or search scans.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "cloning", "scanning", "completed", "failed", "cancelled"],
            description: "Filter scans by status. If not provided, returns all scans.",
          },
          limit: {
            type: "number",
            description: "Maximum number of scans to return. Defaults to 20.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_detection_scan_detail",
      description:
        "Get detailed information about a specific AI Detection scan including its status, repository info, progress, findings count, duration, and triggered-by user. Use this to investigate a particular scan.",
      parameters: {
        type: "object",
        properties: {
          scan_id: {
            type: "number",
            description: "The ID of the scan to retrieve details for.",
          },
        },
        required: ["scan_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_detection_findings",
      description:
        "Get findings for a specific AI Detection scan. Returns AI/ML libraries, dependencies, API calls, secrets, and other AI components found in the codebase. Supports filtering by severity/confidence and pagination.",
      parameters: {
        type: "object",
        properties: {
          scan_id: {
            type: "number",
            description: "The scan ID to get findings for.",
          },
          severity: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Filter findings by confidence level.",
          },
          limit: {
            type: "number",
            description: "Maximum number of findings to return. Defaults to 50.",
          },
        },
        required: ["scan_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_detection_security_findings",
      description:
        "Get model security findings for AI Detection scans. Returns security vulnerabilities, CWE references, and severity assessments for AI/ML components. Supports filtering by scan and severity.",
      parameters: {
        type: "object",
        properties: {
          scan_id: {
            type: "number",
            description: "Optional scan ID to scope security findings to a specific scan.",
          },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low", "info"],
            description: "Filter security findings by severity level.",
          },
          limit: {
            type: "number",
            description: "Maximum number of security findings to return. Defaults to 50.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_detection_security_summary",
      description:
        "Get a summary of findings for AI Detection scans across all completed scans. Returns total counts, breakdowns by confidence level, provider, and finding type. Use this for a quick security overview.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_detection_governance_summary",
      description:
        "Get governance review status summary for AI Detection findings. Returns counts of reviewed, approved, flagged, and unreviewed findings. Use this to understand governance progress.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_detection_stats",
      description:
        "Get comprehensive AI Detection statistics including total scans, completed scans, total findings, unique repositories, top providers, findings by confidence and type, security findings count, and recent activity. Use this for dashboard-level metrics.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_detection_compliance_mapping",
      description:
        "Get compliance framework mapping for AI Detection findings from a specific scan. Returns how findings map to regulatory requirements (EU AI Act, ISO 42001, etc.) and governance statuses. Use this for compliance reporting.",
      parameters: {
        type: "object",
        properties: {
          scan_id: {
            type: "number",
            description: "The scan ID to generate compliance mapping for.",
          },
        },
        required: ["scan_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_start_ai_detection_scan",
      description:
        "Start a new AI Detection scan for a repository. Creates a pending scan record that will be picked up by the scan worker. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          repository_id: {
            type: "number",
            description: "The ID of the registered repository to scan.",
          },
          scan_type: {
            type: "string",
            enum: ["full", "incremental"],
            description:
              "Type of scan to perform. 'full' scans the entire codebase, 'incremental' only scans changes. Defaults to 'full'.",
          },
        },
        required: ["repository_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_cancel_ai_detection_scan",
      description:
        "Cancel an in-progress AI Detection scan. Only scans with status 'pending', 'cloning', or 'scanning' can be cancelled. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          scan_id: {
            type: "number",
            description: "The ID of the scan to cancel.",
          },
        },
        required: ["scan_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_finding_governance_status",
      description:
        "Update the governance status of an AI Detection finding. Use this to mark findings as reviewed, approved, or flagged during the governance review process. Requires user confirmation before executing.",
      parameters: {
        type: "object",
        properties: {
          finding_id: {
            type: "number",
            description: "The ID of the finding to update.",
          },
          governance_status: {
            type: "string",
            enum: ["reviewed", "approved", "flagged"],
            description: "The new governance status for the finding.",
          },
        },
        required: ["finding_id", "governance_status"],
      },
    },
  },
];
