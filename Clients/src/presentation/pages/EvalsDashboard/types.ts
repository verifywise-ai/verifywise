/**
 * Type definitions for DeepEval Experiments Dashboard
 */

/**
 * DeepEval Project - A container for organizing evaluation runs
 * Simplified to only store name and description.
 * Model configs, datasets, and metrics are configured per evaluation run.
 */
export interface DeepEvalProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tenant?: string;
  // Project-level defaults/configuration
  useCase?: "chatbot" | "rag" | "agent";
  defaultDataset?: "chatbot" | "rag" | "agent" | "safety";
  orgId?: string;
}

export interface DeepEvalOrganization {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Experiment Run - A single evaluation run within a project
 * Contains model config, dataset, metrics, and results
 */
export interface ExperimentRun {
  id: string;
  projectId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: string;
  
  // Model configuration for this run
  model: {
    name: string;
    provider: "huggingface" | "openai" | "ollama";
    generation?: {
      maxTokens: number;
      temperature: number;
      topP: number;
    };
  };
  
  // Dataset configuration for this run
  dataset: {
    useBuiltin: boolean;
    categories?: string[];
    difficulties?: string[];
    limit?: number;
  };
  
  // Enabled metrics for this run
  enabledMetrics: {
    answerRelevancy: boolean;
    bias: boolean;
    toxicity: boolean;
    faithfulness: boolean;
    hallucination: boolean;
    contextualRelevancy: boolean;
  };
  
  // Metric thresholds for this run
  metricThresholds: {
    answerRelevancy: number;
    bias: number;
    toxicity: number;
    faithfulness: number;
    hallucination: number;
    contextualRelevancy: number;
  };
  
  // Results
  metrics: {
    answerRelevancy?: number;
    bias?: number;
    toxicity?: number;
    faithfulness?: number;
    hallucination?: number;
    contextualRelevancy?: number;
  };
  totalSamples: number;
  avgWordCount?: number;
  duration?: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface ExperimentDetail {
  id: string;
  projectId: string;
  status: string;
  results: {
    model: string;
    dataset: string;
    totalSamples: number;
    timestamp: string;
    metricSummaries: Record<string, MetricSummary>;
    avgWordCount: number;
    avgResponseLength: number;
    detailedResults?: SampleResult[];
  };
}

export interface MetricSummary {
  averageScore: number;
  passRate: number;
  minScore: number;
  maxScore: number;
  totalEvaluated: number;
}

export interface SampleResult {
  sampleId: string;
  protectedAttributes: {
    category: string;
    difficulty: string;
  };
  input: string;
  actualOutput: string;
  expectedOutput: string;
  responseLength: number;
  wordCount: number;
  metricScores: Record<string, {
    score: number;
    passed: boolean;
    threshold: number;
    reason?: string;
  }>;
  timestamp: string;
}

export interface PerformanceHistory {
  projectId: string;
  experiments: Array<{
    id: string;
    timestamp: string;
    metrics: Record<string, number>;
  }>;
}

// ==================== Report Types ====================

export type ReportFormat = "pdf" | "csv";

export interface ReportSection {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface ReportConfig {
  title: string;
  format: ReportFormat;
  experimentIds: string[];
  sections: ReportSection[];
  includeDetailedSamples: boolean;
  includeArena: boolean;
}

export interface ReportExperimentData {
  id: string;
  name: string;
  status: string;
  model: string;
  dataset: string;
  judge: string;
  scorer: string;
  useCase: string;
  totalSamples: number;
  createdAt: string;
  completedAt?: string;
  duration?: number;
  metricSummaries: Record<string, MetricSummary>;
  metricThresholds: Record<string, number>;
  detailedResults?: SampleResult[];
}

export interface ReportArenaData {
  id: string;
  name: string;
  winner: string;
  contestants: Array<{
    model: string;
    wins: number;
    losses: number;
    ties: number;
    avgScore: number;
  }>;
  criteria: string[];
  rounds: number;
  createdAt: string;
}

export const DEFAULT_REPORT_SECTIONS: ReportSection[] = [
  { id: "executive-summary", label: "Executive Summary", description: "Overall scores, pass/fail verdict, key findings", enabled: true },
  { id: "evaluation-context", label: "Evaluation Context", description: "Project, organization, evaluator, and date information", enabled: true },
  { id: "model-under-test", label: "Model Under Test", description: "Provider, model ID, and generation parameters", enabled: true },
  { id: "evaluation-setup", label: "Evaluation Setup", description: "Dataset, judge model, enabled metrics, and thresholds", enabled: true },
  { id: "metric-results", label: "Metric Results", description: "Per-metric scores grouped by Quality and Safety", enabled: true },
  { id: "safety-compliance", label: "Safety & Compliance", description: "Bias, Toxicity, Hallucination analysis with governance notes", enabled: true },
  { id: "sample-details", label: "Sample-Level Details", description: "Per-sample scores table (can increase report size)", enabled: false },
  { id: "arena-comparison", label: "Arena Comparison", description: "Head-to-head model comparison results", enabled: false },
  { id: "recommendations", label: "Limitations & Recommendations", description: "Auto-generated suggestions based on failing metrics", enabled: true },
];

