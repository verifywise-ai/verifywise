export const toolsDefinition: any[] = [
    {
        type: "function",
        function: {
            name: "fetch_risks",
            description: "Retrieve and filter risks from the database. Use this tool to search for specific risks based on project, framework, severity, likelihood, category, mitigation status, risk level, or AI lifecycle phase. Returns an array of risk objects matching the specified criteria.",
            parameters: {
                type: "object",
                properties: {
                    projectId: {
                        type: "number",
                        description: "Filter risks by project ID. Use this to get risks associated with a specific project."
                    },
                    frameworkId: {
                        type: "number",
                        description: "Filter risks by framework ID (e.g., ISO-42001, ISO-27001, EU AI Act). Use this to get risks mapped to a specific compliance framework."
                    },
                    severity: {
                        type: "string",
                        enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
                        description: "Filter by risk severity level. Catastrophic is the highest severity, Negligible is the lowest."
                    },
                    likelihood: {
                        type: "string",
                        enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"],
                        description: "Filter by likelihood of occurrence. Almost Certain is the highest probability, Rare is the lowest."
                    },
                    category: {
                        type: "string",
                        description: "Filter by risk category (e.g., 'Data Privacy', 'Model Bias', 'Security', 'Performance'). Supports partial matching."
                    },
                    mitigationStatus: {
                        type: "string",
                        enum: ["Not Started", "In Progress", "Completed", "On Hold", "Deferred", "Canceled", "Requires review"],
                        description: "Filter by current mitigation status. Use this to find risks that need attention or have been resolved."
                    },
                    riskLevel: {
                        type: "string",
                        enum: ["No risk", "Very low risk", "Low risk", "Medium risk", "High risk", "Very high risk"],
                        description: "Filter by auto-calculated risk level (based on severity × likelihood). Use this to find high-priority risks."
                    },
                    aiLifecyclePhase: {
                        type: "string",
                        enum: [
                            "Problem definition & planning",
                            "Data collection & processing",
                            "Model development & training",
                            "Model validation & testing",
                            "Deployment & integration",
                            "Monitoring & maintenance",
                            "Decommissioning & retirement"
                        ],
                        description: "Filter by AI lifecycle phase where the risk occurs."
                    },
                    limit: {
                        type: "number",
                        description: "Maximum number of risks to return. Default is to return all matching risks. Use this to get a preview or top N results."
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_risk_analytics",
            description: "Get comprehensive analytics and distributions for risk data. Use this tool to understand the risk landscape, identify patterns, and generate insights about risk distribution across different dimensions. Returns aggregated statistics, risk matrix data, category breakdowns, and phase distributions.",
            parameters: {
                type: "object",
                properties: {
                    projectId: {
                        type: "number",
                        description: "Optional: Scope analytics to a specific project. If not provided, returns analytics for all risks in the tenant."
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_executive_summary",
            description: "Get a high-level executive summary of the risk landscape. Use this tool for quick overview of critical metrics, urgent risks, mitigation progress, and top risk areas. Ideal for answering questions about overall risk posture, priorities, and what needs immediate attention.",
            parameters: {
                type: "object",
                properties: {
                    projectId: {
                        type: "number",
                        description: "Optional: Scope summary to a specific project. If not provided, returns summary for all risks in the tenant."
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_risk_history_timeseries",
            description: "Get historical timeseries data for risk parameters over a specified timeframe. Use this tool to show trends and changes over time for severity, likelihood, mitigation status, or risk level. Perfect for answering questions about risk trends, historical changes, and how risks have evolved. Returns time-stamped data points that can be visualized as line charts.",
            parameters: {
                type: "object",
                properties: {
                    parameter: {
                        type: "string",
                        enum: ["severity", "likelihood", "mitigation_status", "risk_level"],
                        description: "The risk parameter to track over time. 'severity' shows how risk severities changed, 'likelihood' tracks probability changes, 'mitigation_status' shows mitigation progress, and 'risk_level' tracks overall risk levels."
                    },
                    timeframe: {
                        type: "string",
                        enum: ["7days", "15days", "1month", "3months", "6months", "1year"],
                        description: "The time period to analyze. Shorter timeframes (7days, 15days, 1month) show daily data points, while longer timeframes (3months, 6months) show weekly data, and 1year shows monthly data."
                    }
                },
                required: ["parameter", "timeframe"]
            }
        }
    },
    // NOTE: agent_create_risk (AI WRITE tool) used to live here. It has
    // moved to `advisor/aiActions/createRisk/definition.ts` and is merged
    // into the LLM's tool list by the advisor controller via the AI
    // Actions registry. This file only holds read-only risk tools now.
];
