export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "fetch_vendors",
      description:
        "Retrieve and filter vendors from the vendor registry. Use this tool to search for specific vendors based on review status, data sensitivity, business criticality, regulatory exposure, or risk score. Returns an array of vendor objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          review_status: {
            type: "string",
            enum: ["Not started", "In review", "Reviewed", "Requires follow-up"],
            description:
              "Filter by vendor review status. 'Not started' means review hasn't begun, 'In review' is currently being reviewed, 'Reviewed' is complete, 'Requires follow-up' needs additional attention.",
          },
          data_sensitivity: {
            type: "string",
            enum: [
              "None",
              "Internal only",
              "Personally identifiable information (PII)",
              "Financial data",
              "Health data (e.g. HIPAA)",
              "Model weights or AI assets",
              "Other sensitive data",
            ],
            description: "Filter by the type of sensitive data the vendor handles.",
          },
          business_criticality: {
            type: "string",
            enum: [
              "Low (vendor supports non-core functions)",
              "Medium (affects operations but is replaceable)",
              "High (critical to core services or products)",
            ],
            description: "Filter by how critical the vendor is to business operations.",
          },
          regulatory_exposure: {
            type: "string",
            enum: [
              "None",
              "GDPR (EU)",
              "HIPAA (US)",
              "SOC 2",
              "ISO 27001",
              "EU AI act",
              "CCPA (california)",
              "Other",
            ],
            description: "Filter by regulatory framework the vendor is subject to.",
          },
          vendor_name: {
            type: "string",
            description: "Filter by vendor name. Supports partial matching.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of vendors to return. Default is to return all matching vendors.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_vendor_risks",
      description:
        "Retrieve and filter vendor-related risks. Use this tool to search for risks associated with vendors based on likelihood, severity, risk level, or vendor. Returns an array of vendor risk objects matching the specified criteria.",
      parameters: {
        type: "object",
        properties: {
          vendorId: {
            type: "number",
            description:
              "Filter risks by vendor ID. Use this to get risks associated with a specific vendor.",
          },
          likelihood: {
            type: "string",
            enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"],
            description: "Filter by risk likelihood.",
          },
          risk_severity: {
            type: "string",
            enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
            description: "Filter by risk severity level.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of risks to return. Default is to return all matching risks.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vendor_analytics",
      description:
        "Get comprehensive analytics and distributions for vendor data. Use this tool to understand the vendor landscape, identify patterns, and generate insights about vendor distribution across different dimensions. Returns aggregated statistics including review status distribution, data sensitivity breakdown, business criticality, regulatory exposure, and risk scores.",
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
      name: "get_vendor_executive_summary",
      description:
        "Get a high-level executive summary of the vendor landscape. Use this tool for quick overview of total vendors, review status breakdown, high-risk vendors, data sensitivity distribution, and vendors needing attention. Ideal for answering questions about overall vendor risk posture and compliance status.",
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
      name: "agent_create_vendor",
      description:
        "Create a new vendor in the vendor registry. Requires human confirmation before execution. Use this when the user asks to add or register a new vendor.",
      parameters: {
        type: "object",
        properties: {
          vendor_name: {
            type: "string",
            description: "Name of the vendor to create.",
          },
          description: {
            type: "string",
            description: "Description of what the vendor provides.",
          },
          website: {
            type: "string",
            description: "Vendor website URL.",
          },
          contact_person: {
            type: "string",
            description: "Vendor contact person name.",
          },
          review_status: {
            type: "string",
            enum: ["Not started", "In review", "Reviewed", "Requires follow-up"],
            description: "Initial review status for the vendor.",
          },
          data_sensitivity: {
            type: "string",
            enum: [
              "None",
              "Internal only",
              "Personally identifiable information (PII)",
              "Financial data",
              "Health data (e.g. HIPAA)",
              "Model weights or AI assets",
              "Other sensitive data",
            ],
            description: "Type of sensitive data the vendor handles.",
          },
          criticality_level: {
            type: "string",
            enum: [
              "Low (vendor supports non-core functions)",
              "Medium (affects operations but is replaceable)",
              "High (critical to core services or products)",
            ],
            description: "How critical the vendor is to business operations.",
          },
          project_id: {
            type: "number",
            description: "Project ID to associate the vendor with.",
          },
        },
        required: ["vendor_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_vendor",
      description:
        "Update an existing vendor's details. Requires human confirmation before execution. Use this when the user asks to modify vendor information.",
      parameters: {
        type: "object",
        properties: {
          vendor_id: {
            type: "number",
            description: "ID of the vendor to update.",
          },
          vendor_name: {
            type: "string",
            description: "Updated vendor name.",
          },
          description: {
            type: "string",
            description: "Updated description of what the vendor provides.",
          },
          website: {
            type: "string",
            description: "Updated vendor website URL.",
          },
          contact_person: {
            type: "string",
            description: "Updated vendor contact person name.",
          },
          review_status: {
            type: "string",
            enum: ["Not started", "In review", "Reviewed", "Requires follow-up"],
            description: "Updated review status.",
          },
          data_sensitivity: {
            type: "string",
            enum: [
              "None",
              "Internal only",
              "Personally identifiable information (PII)",
              "Financial data",
              "Health data (e.g. HIPAA)",
              "Model weights or AI assets",
              "Other sensitive data",
            ],
            description: "Updated data sensitivity level.",
          },
          criticality_level: {
            type: "string",
            enum: [
              "Low (vendor supports non-core functions)",
              "Medium (affects operations but is replaceable)",
              "High (critical to core services or products)",
            ],
            description: "Updated business criticality level.",
          },
          risk_score: {
            type: "number",
            description: "Updated risk score (0-100).",
          },
        },
        required: ["vendor_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_vendor",
      description:
        "Permanently delete a vendor and all its associated risks and project links. This is irreversible. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          vendor_id: {
            type: "number",
            description: "ID of the vendor to delete.",
          },
        },
        required: ["vendor_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_create_vendor_risk",
      description:
        "Create a new risk entry for a vendor. Requires human confirmation before execution. Use this when the user asks to add or log a new risk for a vendor.",
      parameters: {
        type: "object",
        properties: {
          vendor_id: {
            type: "number",
            description: "ID of the vendor to associate the risk with.",
          },
          risk_name: {
            type: "string",
            description: "Short name or title for the risk.",
          },
          risk_description: {
            type: "string",
            description: "Detailed description of the risk.",
          },
          severity: {
            type: "string",
            enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
            description: "Severity level of the risk.",
          },
          likelihood: {
            type: "string",
            enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"],
            description: "Likelihood of the risk occurring.",
          },
        },
        required: ["vendor_id", "risk_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_update_vendor_risk",
      description:
        "Update an existing vendor risk entry. Requires human confirmation before execution. Use this when the user asks to modify a vendor risk.",
      parameters: {
        type: "object",
        properties: {
          vendor_risk_id: {
            type: "number",
            description: "ID of the vendor risk to update.",
          },
          risk_description: {
            type: "string",
            description: "Updated risk description.",
          },
          impact_description: {
            type: "string",
            description: "Updated impact description.",
          },
          severity: {
            type: "string",
            enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
            description: "Updated severity level.",
          },
          likelihood: {
            type: "string",
            enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"],
            description: "Updated likelihood.",
          },
          action_plan: {
            type: "string",
            description: "Updated action plan.",
          },
          action_owner: {
            type: "string",
            description: "Updated action owner.",
          },
          risk_level: {
            type: "string",
            description: "Updated risk level.",
          },
        },
        required: ["vendor_risk_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_delete_vendor_risk",
      description:
        "Soft-delete a vendor risk entry (marks as deleted). This is irreversible via the advisor. Requires human confirmation before execution.",
      parameters: {
        type: "object",
        properties: {
          vendor_risk_id: {
            type: "number",
            description: "ID of the vendor risk to delete.",
          },
        },
        required: ["vendor_risk_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_flag_vendor_for_review",
      description:
        "Flag a vendor for follow-up review with a reason. Requires human confirmation before execution. Use this when the user wants to mark a vendor as needing attention.",
      parameters: {
        type: "object",
        properties: {
          vendor_id: {
            type: "number",
            description: "ID of the vendor to flag for review.",
          },
          reason: {
            type: "string",
            description: "Reason for flagging the vendor for review.",
          },
        },
        required: ["vendor_id"],
      },
    },
  },
];
