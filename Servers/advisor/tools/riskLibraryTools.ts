export const toolsDefinition: any[] = [
    {
        type: "function",
        function: {
            name: "search_risk_library",
            description: "Search the Risk Intelligence Library for risk scenarios. Use this tool to find risks by keyword, source (MIT, IBM, AI_GENERATED, CUSTOM), risk type, domain, EU AI Act tier, severity, likelihood, industry, or lifecycle phase. Returns matching risk entries with their taxonomy dimensions and mitigation counts.",
            parameters: {
                type: "object",
                properties: {
                    search: {
                        type: "string",
                        description: "Full-text search across risk summaries and descriptions. Use keywords like 'bias', 'privacy', 'safety', 'fairness'."
                    },
                    source: {
                        type: "string",
                        enum: ["MIT", "IBM", "AIID", "AI_GENERATED", "CUSTOM"],
                        description: "Filter by data source. MIT and IBM are curated academic/industry databases, AI_GENERATED are LLM-created, CUSTOM are user-added."
                    },
                    risk_type: {
                        type: "string",
                        description: "Filter by risk type (e.g., 'Legal', 'cybersecurity', 'environmental', 'technical', 'trust', 'privacy', 'societal')."
                    },
                    domain: {
                        type: "string",
                        description: "Filter by MIT domain (e.g., 'Discrimination & Toxicity', 'Privacy & Security', 'Misinformation', 'AI System Safety & Reliability')."
                    },
                    eu_ai_act_tier: {
                        type: "string",
                        enum: ["prohibited", "high", "limited", "minimal"],
                        description: "Filter by EU AI Act risk tier classification."
                    },
                    severity: {
                        type: "string",
                        enum: ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"],
                        description: "Filter by risk severity level."
                    },
                    likelihood: {
                        type: "string",
                        enum: ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"],
                        description: "Filter by likelihood of occurrence."
                    },
                    industry: {
                        type: "string",
                        description: "Filter by industry (e.g., 'Healthcare', 'Finance', 'Education', 'General')."
                    },
                    limit: {
                        type: "number",
                        description: "Maximum number of results to return. Default is 10."
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_risk_library_entry",
            description: "Get full details of a specific risk from the Risk Intelligence Library, including its mitigations (with strategies like avoid/transfer/mitigate/accept), linked real-world incidents, and organization-specific notes. Use this after searching to get comprehensive information about a specific risk.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "number",
                        description: "The ID of the risk library entry to retrieve."
                    }
                },
                required: ["id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "suggest_mitigations_from_library",
            description: "Find mitigations for a risk from the Risk Intelligence Library. Searches the library by description and returns matching risks with their structured mitigations. Each mitigation includes strategy (avoid/transfer/mitigate/accept), implementation guidance, and evidence requirements.",
            parameters: {
                type: "object",
                properties: {
                    risk_description: {
                        type: "string",
                        description: "Description of the risk to find mitigations for. The library will be searched for matching risks and their mitigations will be returned."
                    },
                    risk_id: {
                        type: "number",
                        description: "Optional: Direct risk library entry ID. If provided, returns mitigations for this specific entry instead of searching."
                    }
                },
                required: ["risk_description"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_risk_library_stats",
            description: "Get aggregate statistics about the Risk Intelligence Library. Returns total risk count, breakdown by source (MIT, IBM, AI_GENERATED), by risk type, by domain, by severity, and by EU AI Act tier. Useful for understanding the library coverage and composition.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    }
];
