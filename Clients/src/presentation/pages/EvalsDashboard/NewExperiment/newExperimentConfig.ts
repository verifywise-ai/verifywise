/**
 * @fileoverview Shared constants for the New Experiment wizard.
 *
 * @module pages/EvalsDashboard/NewExperiment/newExperimentConfig
 */

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "huggingface"
  | "mistral"
  | "ollama"
  | "local"
  | "custom_api"
  | "openrouter";

export type JudgeMode = "scorer" | "standard" | "both";

/** Step labels shown in the StepperModal header. */
export const WIZARD_STEPS = ["Model", "Dataset", "Scorer / Judge", "Metrics"] as const;

/**
 * Model-under-evaluation providers that do not require a cloud API key
 * (local runtimes / on-prem). Used by step-0 gating.
 */
export const MODEL_PROVIDERS_WITHOUT_API_KEY = ["ollama", "local"] as const;

/**
 * Scorer judge-model providers that do not require a saved org API key.
 * Used when computing missing keys for custom scorers.
 */
export const SCORER_PROVIDERS_WITHOUT_API_KEY = ["self-hosted", "ollama"] as const;

export type TaskType = "chatbot" | "rag" | "agent";

export type DatasetTurnType = "single-turn" | "multi-turn" | "simulated";

export interface DatasetPrompt {
  id: string;
  category: string;
  prompt: string;
  expected_output: string;
  expected_keywords: string[];
  difficulty: string;
}

export interface UserDataset {
  id: string;
  name: string;
  path: string;
  promptCount: number;
  turnType?: DatasetTurnType;
}

export interface DatasetTemplate {
  name: string;
  path: string;
  desc: string;
  type: "single-turn" | "multi-turn";
  taskType: TaskType;
}

/** Builtin preset templates shown on the Dataset wizard step, keyed by task type. */
export const DATASET_TEMPLATES: readonly DatasetTemplate[] = [
  // Chatbot — single-turn
  {
    name: "Basic Chatbot",
    path: "chatbot/chatbot_basic.json",
    desc: "Standard question-answer pairs",
    type: "single-turn",
    taskType: "chatbot",
  },
  {
    name: "Coding Helper",
    path: "chatbot/chatbot_coding_helper.json",
    desc: "Code assistance scenarios",
    type: "single-turn",
    taskType: "chatbot",
  },
  {
    name: "Customer Support (Single-Turn)",
    path: "chatbot/chatbot_customer_support.json",
    desc: "Support Q&A pairs",
    type: "single-turn",
    taskType: "chatbot",
  },
  // Chatbot — multi-turn
  {
    name: "General Assistant Multi-Turn",
    path: "chatbot/chatbot_general_assistant_multiturn.json",
    desc: "Multi-turn conversations",
    type: "multi-turn",
    taskType: "chatbot",
  },
  {
    name: "Customer Support Multi-Turn",
    path: "chatbot/chatbot_customer_support_multiturn.json",
    desc: "Support conversations",
    type: "multi-turn",
    taskType: "chatbot",
  },
  {
    name: "Tech Support Multi-Turn",
    path: "chatbot/chatbot_tech_support_multiturn.json",
    desc: "Technical help conversations",
    type: "multi-turn",
    taskType: "chatbot",
  },
  // RAG
  {
    name: "Product Docs",
    path: "rag/rag_product_docs.json",
    desc: "Product documentation queries",
    type: "single-turn",
    taskType: "rag",
  },
  {
    name: "Wikipedia QA",
    path: "rag/rag_wikipedia_small.json",
    desc: "Wikipedia-based questions",
    type: "single-turn",
    taskType: "rag",
  },
  {
    name: "Research Papers",
    path: "rag/rag_research_papers.json",
    desc: "Academic content retrieval",
    type: "single-turn",
    taskType: "rag",
  },
  {
    name: "Document Q&A Multi-Turn",
    path: "rag/rag_document_qa_multiturn.json",
    desc: "Multi-turn document conversations",
    type: "multi-turn",
    taskType: "rag",
  },
  // Agent
  {
    name: "Agent Planning",
    path: "agent/agent_planning_multiturn.json",
    desc: "Multi-step planning scenarios",
    type: "multi-turn",
    taskType: "agent",
  },
  {
    name: "Agent Task Execution",
    path: "agent/agent_task_execution_multiturn.json",
    desc: "Tool usage and task completion",
    type: "multi-turn",
    taskType: "agent",
  },
  {
    name: "Agent Workflow Automation",
    path: "agent/agent_workflow_automation_multiturn.json",
    desc: "Automated workflow tasks",
    type: "multi-turn",
    taskType: "agent",
  },
];
