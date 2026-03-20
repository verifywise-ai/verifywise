import type { ExploreVideoData } from "./shared/buildExploreConfig";

export const EXPLORE_VIDEO_DATA: Record<string, ExploreVideoData> = {
  "AI governance": {
    introTitle: "AI Governance",
    introSubtitle: "Full lifecycle oversight",
    features: [
      {
        number: "01",
        category: "INVENTORY",
        title: "Model inventory\n& lifecycle",
        description:
          "Register and track AI models with details like hosting, biases, and limitations. Extend with the lifecycle plugin.",
      },
      {
        number: "02",
        category: "USE CASES",
        title: "Use case\nmanagement",
        description:
          "Register, classify, and monitor AI use cases with intake forms and risk scoring.",
      },
      {
        number: "03",
        category: "VISIBILITY",
        title: "Entity graph",
        description:
          "Visualize relationships between models, risks, vendors, and policies in an interactive graph.",
      },
      {
        number: "04",
        category: "DISCOVERY",
        title: "Agent discovery",
        description:
          "Inventory and govern AI agents deployed across your organization with capability tracking.",
      },
    ],
  },

  "Compliance": {
    introTitle: "Compliance",
    introSubtitle: "Framework alignment",
    features: [
      {
        number: "01",
        category: "FRAMEWORKS",
        title: "Multi-framework\nsupport",
        description:
          "EU AI Act, ISO 42001, ISO 27001, NIST AI RMF — all built in with controls and assessments.",
      },
      {
        number: "02",
        category: "CONTROLS",
        title: "Controls &\nassessments",
        description:
          "Map controls to requirements, answer assessment questions, and track compliance progress.",
      },
      {
        number: "03",
        category: "TRACKING",
        title: "Progress\ntracking",
        description:
          "Real-time compliance scores per framework with drill-down into gaps and incomplete items.",
      },
      {
        number: "04",
        category: "EXTENSIBLE",
        title: "Plugin\nframeworks",
        description:
          "Add SOC 2, GDPR, HIPAA, and more via the plugin marketplace — same controls experience.",
      },
    ],
  },

  "Risk management": {
    introTitle: "Risk Management",
    introSubtitle: "Identify & mitigate",
    features: [
      {
        number: "01",
        category: "REGISTER",
        title: "Risk register",
        description:
          "Centralized register for all AI risks with categorization, ownership, and status tracking.",
      },
      {
        number: "02",
        category: "SCORING",
        title: "Risk scoring &\nclassification",
        description:
          "Automated risk classification based on impact, likelihood, and AI-specific criteria.",
      },
      {
        number: "03",
        category: "MITIGATION",
        title: "Mitigation\ntracking",
        description:
          "Assign mitigations, set deadlines, and track resolution progress across your portfolio.",
      },
      {
        number: "04",
        category: "VENDORS",
        title: "Vendor risk\nlinkage",
        description:
          "Link vendor risks to project risks for end-to-end supply chain visibility.",
      },
    ],
  },

  "LLM Evals": {
    introTitle: "LLM Evaluations",
    introSubtitle: "Quality & safety testing",
    features: [
      {
        number: "01",
        category: "TEST CASES",
        title: "Test case\ncreation",
        description:
          "Build evaluation datasets with input/output pairs and golden answers for benchmarking.",
      },
      {
        number: "02",
        category: "METRICS",
        title: "Metric\nconfiguration",
        description:
          "Configure accuracy, relevance, toxicity, bias, and custom metrics for each evaluation.",
      },
      {
        number: "03",
        category: "ARENA",
        title: "Model comparison\narena",
        description:
          "Side-by-side model comparison with scored results to find the best model for your use case.",
      },
      {
        number: "04",
        category: "AUDITS",
        title: "Bias audits",
        description:
          "Systematic bias detection across protected attributes with detailed audit reports.",
      },
    ],
  },

  "AI detection": {
    introTitle: "AI Detection",
    introSubtitle: "Code & dependency scanning",
    features: [
      {
        number: "01",
        category: "SCANNING",
        title: "Repository\nscanning",
        description:
          "Scan code repositories for AI-generated code patterns and ML library usage.",
      },
      {
        number: "02",
        category: "DEPENDENCIES",
        title: "AI/ML dependency\ndetection",
        description:
          "Automatically detect AI/ML libraries, containers, and frameworks in your codebase.",
      },
      {
        number: "03",
        category: "INVENTORY",
        title: "AI bill of\nmaterials",
        description:
          "Generate a complete AI-BOM listing all AI components, models, and dependencies.",
      },
      {
        number: "04",
        category: "SECURITY",
        title: "Security\nfindings",
        description:
          "Identify vulnerabilities in AI dependencies with severity scoring and remediation guidance.",
      },
    ],
  },

  "Shadow AI": {
    introTitle: "Shadow AI",
    introSubtitle: "Unauthorized usage monitoring",
    features: [
      {
        number: "01",
        category: "DETECTION",
        title: "Tool detection\n& monitoring",
        description:
          "Ingest events from your network tools and logs to track unauthorized AI tool usage.",
      },
      {
        number: "02",
        category: "ACTIVITY",
        title: "User activity\ntracking",
        description:
          "Track which users access which AI tools, with department breakdowns and trend analysis.",
      },
      {
        number: "03",
        category: "ALERTS",
        title: "Alert rules",
        description:
          "Configure automated alerts when new AI tools are detected or usage thresholds are exceeded.",
      },
      {
        number: "04",
        category: "GOVERNANCE",
        title: "Governance\nworkflow",
        description:
          "Move detected tools through review, approval, restriction, or blocking workflows.",
      },
    ],
  },

  "Policies": {
    introTitle: "Policies",
    introSubtitle: "Governance documentation",
    features: [
      {
        number: "01",
        category: "CREATION",
        title: "Policy creation\n& editor",
        description:
          "Create and edit AI governance policies with status tracking and review date management.",
      },
      {
        number: "02",
        category: "LINKING",
        title: "Linked risks\n& evidence",
        description:
          "Link policies to risks and evidence for full traceability and compliance mapping.",
      },
      {
        number: "03",
        category: "TRACKING",
        title: "Due date\ntracking",
        description:
          "Set review deadlines with automated due-soon reminders via email and Slack.",
      },
    ],
  },

  "Reporting": {
    introTitle: "Reporting",
    introSubtitle: "Compliance documentation",
    features: [
      {
        number: "01",
        category: "GENERATION",
        title: "Report\ngeneration",
        description:
          "Generate comprehensive compliance reports in PDF or DOCX format with one click.",
      },
      {
        number: "02",
        category: "SECTIONS",
        title: "Section\nselection",
        description:
          "Choose which sections to include — risks, vendors, models, controls, assessments, and more.",
      },
      {
        number: "03",
        category: "AI-ENHANCED",
        title: "AI-enhanced\ncontent",
        description:
          "Optionally enrich reports with AI-generated summaries and compliance insights.",
      },
      {
        number: "04",
        category: "SHARING",
        title: "Share links",
        description:
          "Generate secure, time-limited public links to share reports with external stakeholders.",
      },
    ],
  },

  "Training": {
    introTitle: "Training",
    introSubtitle: "Team readiness",
    features: [
      {
        number: "01",
        category: "REGISTRY",
        title: "Training\nregistry",
        description:
          "Central registry of all AI-related training programs, courses, and certifications.",
      },
      {
        number: "02",
        category: "TRACKING",
        title: "Status &\nprogress tracking",
        description:
          "Track training status from planned through in-progress to completed for each program.",
      },
      {
        number: "03",
        category: "COMPLIANCE",
        title: "Compliance\ncoverage",
        description:
          "Maintain a clear record of who has been trained for audit readiness and compliance reviews.",
      },
    ],
  },

  "Plugins": {
    introTitle: "Plugins",
    introSubtitle: "Extend the platform",
    features: [
      {
        number: "01",
        category: "MARKETPLACE",
        title: "Marketplace\nbrowse",
        description:
          "Browse 30+ plugins for frameworks, integrations, and data tools in the marketplace.",
      },
      {
        number: "02",
        category: "INSTALL",
        title: "One-click\ninstall",
        description:
          "Install and configure plugins with a single click — no code changes required.",
      },
      {
        number: "03",
        category: "FRAMEWORKS",
        title: "Framework\nplugins",
        description:
          "Add SOC 2, GDPR, HIPAA, and other compliance frameworks as plugins with full controls.",
      },
      {
        number: "04",
        category: "INTEGRATIONS",
        title: "Integration\nplugins",
        description:
          "Connect Slack, Jira, MLflow, Azure AI, and more for seamless workflow integration.",
      },
    ],
  },
};
