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
];
