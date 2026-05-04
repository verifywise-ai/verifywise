/**
 * Advisor Domain Configuration
 *
 * Central configuration for all Advisor domains. To add a new domain:
 * 1. Add a new entry to ADVISOR_DOMAINS with path, welcomeMessage, and suggestions
 * 2. Create corresponding backend tools in Servers/advisor/tools/
 * 3. Create corresponding backend functions in Servers/advisor/functions/
 * 4. Update Servers/advisor/prompts.ts to include the new tools
 * 5. Update Servers/controllers/advisor.ctrl.ts to import and merge the new tools
 */

export interface AdvisorSuggestion {
  prompt: string;
  label: string;
}

export interface AdvisorDomainConfig {
  path: string;
  displayName: string;
  welcomeMessage: string;
  placeholder: string;
  suggestions: AdvisorSuggestion[];
}

export const ADVISOR_DOMAINS: Record<string, AdvisorDomainConfig> = {
  dashboard: {
    path: "/",
    displayName: "Dashboard",
    welcomeMessage:
      "Hello! I'm your VerifyWise AI Advisor. I can help you with risks, models, vendors, incidents, tasks, policies, use cases, datasets, frameworks, training, evidence, reporting, AI Trust Center, and agent discovery. What would you like to know?",
    placeholder: "Ask me anything about your AI governance...",
    suggestions: [
      { prompt: "Give me an executive summary of our risk landscape", label: "Summarize risks" },
      { prompt: "Which vendors are high risk or require follow-up?", label: "High-risk vendors" },
      { prompt: "What tasks are overdue?", label: "Overdue tasks" },
      { prompt: "Show me our model inventory summary", label: "Model overview" },
      { prompt: "Are there any open incidents?", label: "Active incidents" },
      { prompt: "What is our policy review status?", label: "Policy status" },
    ],
  },
  "risk-management": {
    path: "/risk-management",
    displayName: "Risks",
    welcomeMessage:
      "Hello! I'm your AI Risk Management Advisor. I can help you analyze risk distributions, track mitigation progress, identify high-priority risks, and understand trends over time. What would you like to know about your risks?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our risk landscape",
        label: "Summarize all risks",
      },
      {
        prompt: "Show me the risk distribution by severity and likelihood",
        label: "Show risk matrix",
      },
      {
        prompt: "What risks have mitigations that are not started or in progress?",
        label: "Find incomplete mitigations",
      },
      { prompt: "How have risk levels changed over the past month?", label: "Show risk trends" },
      {
        prompt: "What are the top urgent risks with approaching deadlines?",
        label: "List urgent risks",
      },
      { prompt: "Show risks by AI lifecycle phase", label: "Group by lifecycle phase" },
      { prompt: "Which risk categories have the highest count?", label: "Top risk categories" },
    ],
  },
  "model-inventory": {
    path: "/model-inventory",
    displayName: "Models",
    welcomeMessage:
      "Hello! I'm your AI Model Inventory Advisor. I can help you understand your model landscape, check approval statuses, review security assessments, and analyze provider distributions. What would you like to know about your models?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our AI model inventory",
        label: "Summarize all models",
      },
      { prompt: "Which models are pending approval or blocked?", label: "Find pending approvals" },
      {
        prompt: "How many models have completed security assessments?",
        label: "Check security status",
      },
      { prompt: "Show me the breakdown of models by provider", label: "Group by provider" },
      { prompt: "Show me models grouped by hosting provider", label: "Group by hosting" },
      { prompt: "Which models were added in the last 7 days?", label: "Recent models" },
      {
        prompt: "Which models have not undergone security assessment?",
        label: "Find unassessed models",
      },
    ],
  },
  "model-risks": {
    path: "/model-inventory/model-risks",
    displayName: "Model Risks",
    welcomeMessage:
      "Hello! I'm your AI Model Risk Advisor. I can help you analyze model-specific risks, track risk categories and severity levels, monitor mitigation progress, and identify risks needing attention. What would you like to know about your model risks?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our model risk landscape",
        label: "Summarize all model risks",
      },
      {
        prompt: "Show me the distribution of risks by severity level",
        label: "Show severity breakdown",
      },
      { prompt: "Which model risks are critical or high priority?", label: "List critical risks" },
      { prompt: "Show me risks grouped by category", label: "Group by category" },
      { prompt: "What risks are open or in progress?", label: "Find active risks" },
      { prompt: "Which owners have the most risks assigned?", label: "Show owner workload" },
      {
        prompt: "What is our overall risk resolution progress?",
        label: "Check resolution progress",
      },
    ],
  },
  vendors: {
    path: "/vendors",
    displayName: "Vendors",
    welcomeMessage:
      "Hello! I'm your Vendor Management Advisor. I can help you analyze vendor risks, track review statuses, monitor compliance requirements, and identify vendors needing attention. What would you like to know about your vendors?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our vendor landscape",
        label: "Summarize all vendors",
      },
      { prompt: "Show me vendor distribution by review status", label: "Show review status" },
      {
        prompt: "Which vendors are high risk or require follow-up?",
        label: "Find high-risk vendors",
      },
      { prompt: "Show me vendors by data sensitivity level", label: "Group by data sensitivity" },
      { prompt: "Which vendors handle PII or sensitive data?", label: "Find PII vendors" },
      { prompt: "What is our vendor review completion rate?", label: "Check review progress" },
      { prompt: "Show me vendors by regulatory exposure", label: "Group by regulation" },
    ],
  },
  "ai-incident-managements": {
    path: "/ai-incident-managements",
    displayName: "AI Incidents",
    welcomeMessage:
      "Hello! I'm your AI Incident Management Advisor. I can help you analyze incident trends, track severity levels, monitor resolution progress, and identify incidents needing attention. What would you like to know about your AI incidents?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our incident landscape",
        label: "Summarize all incidents",
      },
      { prompt: "Show me incident distribution by severity", label: "Show severity breakdown" },
      {
        prompt: "Which incidents are open or under investigation?",
        label: "Find active incidents",
      },
      { prompt: "Show me incidents grouped by type", label: "Group by incident type" },
      { prompt: "What is our incident resolution rate?", label: "Check resolution progress" },
      { prompt: "Which AI projects have the most incidents?", label: "Show incidents by project" },
      { prompt: "Show me serious or very serious incidents", label: "List critical incidents" },
    ],
  },
  tasks: {
    path: "/tasks",
    displayName: "Tasks",
    welcomeMessage:
      "Hello! I'm your Task Management Advisor. I can help you analyze task distributions, track progress, identify overdue items, and understand workload across your team. What would you like to know about your tasks?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our task landscape",
        label: "Summarize all tasks",
      },
      { prompt: "Show me task distribution by status", label: "Show status breakdown" },
      { prompt: "Which tasks are overdue?", label: "Find overdue tasks" },
      { prompt: "Show me tasks grouped by priority", label: "Group by priority" },
      { prompt: "What is our task completion rate?", label: "Check completion rate" },
      {
        prompt: "Show me high priority tasks that are still open",
        label: "High-priority open tasks",
      },
      { prompt: "What are the top task categories by count?", label: "Top categories" },
    ],
  },
  policies: {
    path: "/policies",
    displayName: "Policies",
    welcomeMessage:
      "Hello! I'm your Policy Management Advisor. I can help you analyze policy coverage, track review schedules, find policy templates, and identify gaps in your governance framework. What would you like to know about your policies?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our policy landscape",
        label: "Summarize all policies",
      },
      { prompt: "Show me policy distribution by status", label: "Show status breakdown" },
      { prompt: "Which policies are overdue for review?", label: "Find overdue reviews" },
      { prompt: "What policy areas do we have coverage gaps in?", label: "Find coverage gaps" },
      { prompt: "Show me policies by tag", label: "Group by tag" },
      {
        prompt: "What policy templates are available for AI ethics?",
        label: "Find AI ethics templates",
      },
      {
        prompt: "Recommend policy templates based on our current coverage",
        label: "Get recommendations",
      },
    ],
  },
  "use-cases": {
    path: "/overview",
    displayName: "Use Cases",
    welcomeMessage:
      "Hello! I'm your Use Case Advisor. I can help you understand your AI use case portfolio, track status and risk classifications, and identify high-risk projects. What would you like to know about your use cases?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our use case portfolio",
        label: "Summarize use cases",
      },
      {
        prompt: "Show me the distribution of use cases by risk classification",
        label: "Show risk classifications",
      },
      {
        prompt: "Which use cases are classified as high risk or unacceptable risk?",
        label: "Find high-risk use cases",
      },
      { prompt: "Show me use cases by status", label: "Show status breakdown" },
      { prompt: "Which projects have the most associated risks?", label: "Riskiest projects" },
      { prompt: "Show me the industry distribution of use cases", label: "Group by industry" },
    ],
  },
  datasets: {
    path: "/datasets",
    displayName: "Datasets",
    welcomeMessage:
      "Hello! I'm your Dataset Advisor. I can help you analyze your dataset inventory, track PII exposure, review data classifications, and identify datasets with known biases. What would you like to know about your datasets?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our dataset landscape",
        label: "Summarize datasets",
      },
      { prompt: "Which datasets contain PII?", label: "Find PII datasets" },
      {
        prompt: "Show me the distribution of datasets by classification level",
        label: "Show classifications",
      },
      { prompt: "Which datasets have known biases?", label: "Find biased datasets" },
      { prompt: "Show me datasets by type", label: "Show type breakdown" },
      { prompt: "What is our PII exposure rate across all datasets?", label: "Check PII exposure" },
    ],
  },
  frameworks: {
    path: "/framework",
    displayName: "Frameworks",
    welcomeMessage:
      "Hello! I'm your Framework Advisor. I can help you understand your compliance framework adoption, project coverage, and compare frameworks. What would you like to know about your frameworks?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "List all frameworks and their project adoption counts",
        label: "List all frameworks",
      },
      {
        prompt: "Which frameworks have the most project adoption?",
        label: "Show adoption ranking",
      },
      {
        prompt: "How many projects are using compliance frameworks?",
        label: "Check framework coverage",
      },
      { prompt: "Which frameworks have no projects assigned?", label: "Find unused frameworks" },
    ],
  },
  training: {
    path: "/training",
    displayName: "Training",
    welcomeMessage:
      "Hello! I'm your Training Registry Advisor. I can help you track training completion rates, department coverage, provider statistics, and identify training gaps. What would you like to know about your training programs?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Give me an executive summary of our training programs",
        label: "Summarize training",
      },
      { prompt: "What is our overall training completion rate?", label: "Check completion rate" },
      { prompt: "Show me training records by status", label: "Show status breakdown" },
      { prompt: "Which departments have training coverage?", label: "Check department coverage" },
      { prompt: "Show me training by provider", label: "Group by provider" },
      { prompt: "How many people have been trained in total?", label: "Total people trained" },
    ],
  },
  evidence: {
    path: "/file-manager",
    displayName: "Evidence",
    welcomeMessage:
      "Hello! I'm your Evidence Hub Advisor. I can help you track evidence items, monitor expiry dates, check model coverage, and identify compliance gaps. What would you like to know about your evidence?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      { prompt: "Give me an executive summary of our evidence", label: "Summarize evidence" },
      { prompt: "Which evidence items have expired?", label: "Find expired evidence" },
      { prompt: "What evidence is expiring in the next 30 days?", label: "Find expiring soon" },
      { prompt: "Show me evidence by type", label: "Show type breakdown" },
      { prompt: "How many models have evidence coverage?", label: "Check model coverage" },
    ],
  },
  reporting: {
    path: "/reporting",
    displayName: "Reporting",
    welcomeMessage:
      "Hello! I'm your Reporting Advisor. I can help you understand your report generation history, find reports by type, and analyze reporting patterns. What would you like to know about your reports?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      { prompt: "Show me all generated reports", label: "List all reports" },
      { prompt: "Show me the breakdown of reports by type", label: "Reports by type" },
      { prompt: "Show me the 5 most recently generated reports", label: "Recent reports" },
      { prompt: "Which projects have the most reports generated?", label: "Reports by project" },
    ],
  },
  "ai-trust-center": {
    path: "/ai-trust-center",
    displayName: "AI Trust Center",
    welcomeMessage:
      "Hello! I'm your AI Trust Center Advisor. I can help you understand your trust center configuration, check section visibility, review resources and subprocessors. What would you like to know about your AI Trust Center?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      {
        prompt: "Show me the current trust center configuration",
        label: "Show trust center overview",
      },
      { prompt: "Which sections are publicly visible?", label: "Check section visibility" },
      { prompt: "How many resources are published?", label: "Count resources" },
      { prompt: "List all subprocessors and their locations", label: "Show subprocessors" },
      { prompt: "How complete is our trust center setup?", label: "Check completeness" },
    ],
  },
  "agent-discovery": {
    path: "/agent-discovery",
    displayName: "Agent Discovery",
    welcomeMessage:
      "Hello! I'm your Agent Discovery Advisor. I can help you understand your discovered agent landscape, track review statuses, identify stale agents, and analyze source system distributions. What would you like to know about your agents?",
    placeholder: "Ask any question about your data...",
    suggestions: [
      { prompt: "Give me an executive summary of agent discovery", label: "Summarize agents" },
      { prompt: "How many agents are unreviewed?", label: "Find unreviewed agents" },
      { prompt: "Show me agents by source system", label: "Group by source" },
      { prompt: "Which agents are flagged as stale?", label: "Find stale agents" },
      { prompt: "What is our agent review rate?", label: "Check review rate" },
      {
        prompt: "Are there any risk indicators in our agent landscape?",
        label: "Check risk indicators",
      },
    ],
  },
};

// Derived types and helpers
export type AdvisorDomain = keyof typeof ADVISOR_DOMAINS;

export const ADVISOR_PATHS = Object.values(ADVISOR_DOMAINS).map((d) => d.path);

export const DEFAULT_WELCOME_MESSAGE =
  "Hello! I'm your VerifyWise AI Advisor. I can help you with risks, models, vendors, incidents, tasks, policies, use cases, datasets, frameworks, training, evidence, reporting, AI Trust Center, and agent discovery. What would you like to know?";

/**
 * Get domain key by path
 */
export const getDomainByPath = (path: string): AdvisorDomain | undefined => {
  const entry = Object.entries(ADVISOR_DOMAINS).find(([, config]) => config.path === path);
  return entry?.[0] as AdvisorDomain | undefined;
};

/**
 * Get welcome message for a domain
 */
export const getWelcomeMessage = (domain?: AdvisorDomain): string => {
  if (!domain) return DEFAULT_WELCOME_MESSAGE;
  return ADVISOR_DOMAINS[domain]?.welcomeMessage ?? DEFAULT_WELCOME_MESSAGE;
};

/**
 * Get suggestions for a domain
 */
export const getSuggestions = (domain?: AdvisorDomain): AdvisorSuggestion[] => {
  if (!domain) return [];
  return ADVISOR_DOMAINS[domain]?.suggestions ?? [];
};

export const DEFAULT_PLACEHOLDER = "Ask any question about your data...";

/**
 * Get placeholder text for a domain
 */
export const getPlaceholder = (domain?: AdvisorDomain): string => {
  if (!domain) return DEFAULT_PLACEHOLDER;
  return ADVISOR_DOMAINS[domain]?.placeholder ?? DEFAULT_PLACEHOLDER;
};

/**
 * Check if a path is advisor-eligible (for the sidebar advisor panel).
 */
export const isAdvisorEligiblePath = (path: string): boolean => {
  return ADVISOR_PATHS.includes(path);
};
