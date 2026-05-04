/**
 * @fileoverview EU AI Act Compliance Mapping Configuration
 *
 * Maps AI Detection finding types and categories to EU AI Act requirements.
 * Used to generate compliance checklists based on scan results.
 */

// ============================================================================
// Types
// ============================================================================

export type ComplianceCategory =
  | "transparency"
  | "documentation"
  | "risk_management"
  | "data_governance"
  | "human_oversight"
  | "security"
  | "monitoring"
  | "accountability";

export type DocumentationRequirement = "required" | "recommended" | "conditional";

export interface ComplianceRequirement {
  id: string;
  articleRef: string; // EU AI Act article reference
  title: string;
  description: string;
  category: ComplianceCategory;
  documentationRequired: DocumentationRequirement;
  checklistItems: string[];
}

export interface FindingComplianceMapping {
  findingType: string;
  provider?: string; // Optional - for provider-specific requirements
  category?: string; // Optional - for category-specific requirements
  requirements: string[]; // IDs of ComplianceRequirement
  riskFactors: string[];
  documentationNeeds: string[];
}

// ============================================================================
// EU AI Act Compliance Requirements
// ============================================================================

export const COMPLIANCE_REQUIREMENTS: Record<string, ComplianceRequirement> = {
  // Article 13 - Transparency
  TRANS_001: {
    id: "TRANS_001",
    articleRef: "Article 13",
    title: "AI System Transparency",
    description:
      "High-risk AI systems shall be designed and developed to ensure their operation is sufficiently transparent to enable deployers to interpret outputs and use appropriately.",
    category: "transparency",
    documentationRequired: "required",
    checklistItems: [
      "Document all AI/ML libraries and frameworks used",
      "Describe how AI components process data",
      "Explain model decision-making process",
      "List all external AI API integrations",
    ],
  },
  TRANS_002: {
    id: "TRANS_002",
    articleRef: "Article 13(3)",
    title: "Model Information Disclosure",
    description:
      "Provide clear information about AI models including their capabilities, limitations, and intended use.",
    category: "transparency",
    documentationRequired: "required",
    checklistItems: [
      "Document all AI models referenced in code",
      "Specify model versions and sources",
      "Describe model capabilities and limitations",
      "Document model training data sources (if applicable)",
    ],
  },
  TRANS_003: {
    id: "TRANS_003",
    articleRef: "Article 50",
    title: "User Notification of AI Interaction",
    description:
      "Providers must ensure users know when interacting with AI systems. AI-generated content must be marked as artificially generated in machine-readable format.",
    category: "transparency",
    documentationRequired: "required",
    checklistItems: [
      "Implement user notification for AI-generated content",
      "Mark synthetic content as artificially generated",
      "Disclose AI agent capabilities to users",
      "Label AI-assisted outputs appropriately",
    ],
  },

  // Article 9 - Risk Management
  RISK_001: {
    id: "RISK_001",
    articleRef: "Article 9",
    title: "AI Risk Management System",
    description:
      "Establish a risk management system for identifying, analyzing, and mitigating risks throughout the AI system lifecycle.",
    category: "risk_management",
    documentationRequired: "required",
    checklistItems: [
      "Identify risks associated with each AI component",
      "Assess data leakage potential for API integrations",
      "Evaluate model bias risks",
      "Document risk mitigation strategies",
    ],
  },
  RISK_002: {
    id: "RISK_002",
    articleRef: "Article 9(2)",
    title: "Third-Party AI Risk Assessment",
    description: "Assess and document risks from third-party AI services and dependencies.",
    category: "risk_management",
    documentationRequired: "required",
    checklistItems: [
      "Evaluate security of external AI APIs",
      "Review third-party AI provider compliance",
      "Assess dependency chain risks",
      "Document vendor risk assessments",
    ],
  },

  // Article 10 - Data Governance
  DATA_001: {
    id: "DATA_001",
    articleRef: "Article 10",
    title: "Training Data Governance",
    description: "Ensure proper governance of training, validation, and testing data sets.",
    category: "data_governance",
    documentationRequired: "required",
    checklistItems: [
      "Document data sources for RAG systems",
      "Ensure data quality and relevance",
      "Implement data bias detection",
      "Maintain data provenance records",
    ],
  },
  DATA_002: {
    id: "DATA_002",
    articleRef: "Article 10(3)",
    title: "Data Processing Documentation",
    description:
      "Document data processing operations including vector embeddings and retrieval systems.",
    category: "data_governance",
    documentationRequired: "required",
    checklistItems: [
      "Document vector database usage",
      "Describe embedding generation process",
      "Map data flow through RAG pipeline",
      "Implement data retention policies",
    ],
  },

  // Article 11 - Technical Documentation
  DOC_001: {
    id: "DOC_001",
    articleRef: "Article 11",
    title: "Technical Documentation",
    description:
      "Maintain comprehensive technical documentation of AI system components and architecture.",
    category: "documentation",
    documentationRequired: "required",
    checklistItems: [
      "Create AI component inventory (AI-BOM)",
      "Document system architecture",
      "Maintain dependency documentation",
      "Record configuration and parameters",
    ],
  },
  DOC_002: {
    id: "DOC_002",
    articleRef: "Article 11(1)",
    title: "AI Library Documentation",
    description: "Document all AI/ML libraries, their versions, and licensing information.",
    category: "documentation",
    documentationRequired: "required",
    checklistItems: [
      "List all AI/ML dependencies",
      "Document library versions",
      "Review and document licenses",
      "Track security vulnerabilities",
    ],
  },

  // Article 14 - Human Oversight
  HUMAN_001: {
    id: "HUMAN_001",
    articleRef: "Article 14",
    title: "Human Oversight Mechanisms",
    description: "Implement appropriate human oversight measures for AI system operation.",
    category: "human_oversight",
    documentationRequired: "required",
    checklistItems: [
      "Define human review points for AI outputs",
      "Implement override mechanisms for AI agents",
      "Establish escalation procedures",
      "Document human-in-the-loop processes",
    ],
  },
  HUMAN_002: {
    id: "HUMAN_002",
    articleRef: "Article 14(4)",
    title: "Agent Autonomy Controls",
    description:
      "Ensure AI agents operate within defined boundaries with appropriate human supervision.",
    category: "human_oversight",
    documentationRequired: "required",
    checklistItems: [
      "Define agent action boundaries",
      "Implement approval workflows for critical actions",
      "Log all agent decisions and actions",
      "Enable human intervention capabilities",
    ],
  },

  // Article 15 - Accuracy, Robustness, Cybersecurity
  SEC_001: {
    id: "SEC_001",
    articleRef: "Article 15",
    title: "AI System Security",
    description:
      "High-risk AI systems shall achieve appropriate levels of accuracy, robustness, and cybersecurity, and perform consistently throughout their lifecycle.",
    category: "security",
    documentationRequired: "required",
    checklistItems: [
      "Declare accuracy levels and metrics in documentation",
      "Implement input validation for AI systems",
      "Protect against prompt injection attacks",
      "Monitor for adversarial inputs",
    ],
  },
  SEC_002: {
    id: "SEC_002",
    articleRef: "Article 15(5)",
    title: "AI-Specific Cybersecurity",
    description:
      "Systems must resist unauthorized alterations and address AI-specific vulnerabilities including data poisoning, model poisoning, adversarial examples, and confidentiality attacks.",
    category: "security",
    documentationRequired: "required",
    checklistItems: [
      "Protect against data poisoning attacks",
      "Protect against model poisoning attacks",
      "Implement defenses against adversarial examples",
      "Secure API keys and credentials",
      "Rotate exposed credentials immediately",
    ],
  },

  // Article 72 - Post-Market Monitoring
  MON_001: {
    id: "MON_001",
    articleRef: "Article 72",
    title: "Post-Market Monitoring",
    description:
      "Providers shall establish and document a post-market monitoring system proportionate to the nature of the AI technologies and risks.",
    category: "monitoring",
    documentationRequired: "required",
    checklistItems: [
      "Establish post-market monitoring system",
      "Monitor AI component performance continuously",
      "Track model drift and degradation",
      "Log AI system outputs and decisions",
      "Implement alerting for anomalies",
    ],
  },

  // Article 17 - Quality Management
  ACC_001: {
    id: "ACC_001",
    articleRef: "Article 17",
    title: "Quality Management System",
    description: "Implement quality management procedures for AI system development and operation.",
    category: "accountability",
    documentationRequired: "required",
    checklistItems: [
      "Establish AI development guidelines",
      "Implement code review for AI components",
      "Maintain version control for AI configurations",
      "Document testing procedures",
    ],
  },
};

// ============================================================================
// Finding Type to Compliance Mapping
// ============================================================================

export const FINDING_COMPLIANCE_MAPPINGS: FindingComplianceMapping[] = [
  // Library findings
  {
    findingType: "library",
    requirements: ["DOC_001", "DOC_002", "TRANS_001", "ACC_001"],
    riskFactors: [
      "Dependency vulnerabilities",
      "License compliance risks",
      "Version compatibility issues",
    ],
    documentationNeeds: [
      "Library name and version",
      "License type and obligations",
      "Security vulnerability status",
      "Update and maintenance status",
    ],
  },

  // API call findings
  {
    findingType: "api_call",
    requirements: ["TRANS_001", "RISK_001", "RISK_002", "SEC_001"],
    riskFactors: [
      "Data transmitted to external services",
      "API availability and reliability",
      "Cost and usage monitoring",
      "Data privacy compliance",
    ],
    documentationNeeds: [
      "API provider and endpoint",
      "Data sent to API",
      "API response handling",
      "Error handling procedures",
    ],
  },

  // Model reference findings
  {
    findingType: "model_ref",
    requirements: ["TRANS_002", "DOC_001", "RISK_001", "DATA_001"],
    riskFactors: [
      "Model bias and fairness",
      "Model version tracking",
      "Model licensing restrictions",
      "Model performance degradation",
    ],
    documentationNeeds: [
      "Model name and version",
      "Model source and provider",
      "Model capabilities and limitations",
      "Intended use cases",
    ],
  },

  // RAG component findings
  {
    findingType: "rag_component",
    requirements: ["DATA_001", "DATA_002", "DOC_001", "TRANS_001"],
    riskFactors: [
      "Data quality and relevance",
      "Retrieval accuracy",
      "Data freshness",
      "Source attribution",
    ],
    documentationNeeds: [
      "Vector database configuration",
      "Embedding model used",
      "Data sources indexed",
      "Retrieval strategy",
    ],
  },

  // Agent findings
  {
    findingType: "agent",
    requirements: ["HUMAN_001", "HUMAN_002", "TRANS_003", "MON_001"],
    riskFactors: [
      "Autonomous decision-making",
      "Action scope and boundaries",
      "Error propagation",
      "User safety",
    ],
    documentationNeeds: [
      "Agent capabilities",
      "Action boundaries",
      "Human oversight mechanisms",
      "Logging and audit trail",
    ],
  },

  // Secret findings
  {
    findingType: "secret",
    requirements: ["SEC_001", "SEC_002", "ACC_001"],
    riskFactors: ["Credential exposure", "Unauthorized access", "Data breach potential"],
    documentationNeeds: [
      "Secret type and purpose",
      "Storage mechanism",
      "Rotation policy",
      "Access controls",
    ],
  },

  // Dependency findings
  {
    findingType: "dependency",
    requirements: ["DOC_002", "RISK_002", "ACC_001"],
    riskFactors: [
      "Supply chain vulnerabilities",
      "Transitive dependency risks",
      "Maintenance status",
    ],
    documentationNeeds: [
      "Dependency tree",
      "Version constraints",
      "Security advisories",
      "Alternative options",
    ],
  },
];

// ============================================================================
// Provider-Specific Requirements
// ============================================================================

export const PROVIDER_SPECIFIC_REQUIREMENTS: Record<string, string[]> = {
  OpenAI: ["TRANS_001", "RISK_002", "SEC_001"],
  Anthropic: ["TRANS_001", "RISK_002", "SEC_001"],
  Google: ["TRANS_001", "RISK_002", "DATA_001"],
  "Google AI": ["TRANS_001", "RISK_002", "DATA_001"],
  "Hugging Face": ["TRANS_002", "DOC_002", "DATA_001"],
  HuggingFace: ["TRANS_002", "DOC_002", "DATA_001"],
  Meta: ["TRANS_002", "DOC_002"],
  LangChain: ["DOC_001", "HUMAN_001", "MON_001"],
  LlamaIndex: ["DOC_001", "DATA_002", "MON_001"],
  Pinecone: ["DATA_002", "SEC_001"],
  Chroma: ["DATA_002", "DOC_001"],
  Weaviate: ["DATA_002", "DOC_001"],
  Qdrant: ["DATA_002", "DOC_001"],
  Milvus: ["DATA_002", "DOC_001"],
  CrewAI: ["HUMAN_001", "HUMAN_002", "TRANS_003"],
  AutoGen: ["HUMAN_001", "HUMAN_002", "TRANS_003"],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get compliance requirements for a finding
 */
export function getComplianceRequirementsForFinding(
  findingType: string,
  provider?: string,
): ComplianceRequirement[] {
  const requirements = new Set<string>();

  // Get requirements from finding type mapping
  const typeMapping = FINDING_COMPLIANCE_MAPPINGS.find((m) => m.findingType === findingType);
  if (typeMapping) {
    typeMapping.requirements.forEach((r) => requirements.add(r));
  }

  // Add provider-specific requirements
  if (provider && PROVIDER_SPECIFIC_REQUIREMENTS[provider]) {
    PROVIDER_SPECIFIC_REQUIREMENTS[provider].forEach((r) => requirements.add(r));
  }

  return Array.from(requirements)
    .map((id) => COMPLIANCE_REQUIREMENTS[id])
    .filter(Boolean);
}

/**
 * Get risk factors for a finding
 */
export function getRiskFactorsForFinding(findingType: string): string[] {
  const typeMapping = FINDING_COMPLIANCE_MAPPINGS.find((m) => m.findingType === findingType);
  return typeMapping?.riskFactors || [];
}

/**
 * Get documentation needs for a finding
 */
export function getDocumentationNeedsForFinding(findingType: string): string[] {
  const typeMapping = FINDING_COMPLIANCE_MAPPINGS.find((m) => m.findingType === findingType);
  return typeMapping?.documentationNeeds || [];
}

/**
 * Get all unique compliance categories from requirements
 */
export function getComplianceCategories(): ComplianceCategory[] {
  const categories = new Set<ComplianceCategory>();
  Object.values(COMPLIANCE_REQUIREMENTS).forEach((req) => {
    categories.add(req.category);
  });
  return Array.from(categories);
}

/**
 * Group requirements by category
 */
export function groupRequirementsByCategory(): Record<ComplianceCategory, ComplianceRequirement[]> {
  const grouped: Record<ComplianceCategory, ComplianceRequirement[]> = {
    transparency: [],
    documentation: [],
    risk_management: [],
    data_governance: [],
    human_oversight: [],
    security: [],
    monitoring: [],
    accountability: [],
  };

  Object.values(COMPLIANCE_REQUIREMENTS).forEach((req) => {
    grouped[req.category].push(req);
  });

  return grouped;
}
