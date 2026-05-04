# Audit: llm-evals/managing-datasets
**Article path:** shared/user-guide-content/content/llm-evals/managing-datasets.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ⚠️ minor issues (2)

## Summary
The article accurately describes most dataset management features including built-in datasets, custom dataset upload/editing, and conversational formats. However, two claims about dataset coverage need clarification: (1) the article lists specific RAG datasets (Product Documentation, Research Papers, Wikipedia) that exist, but does not mention several other RAG datasets actually available in the system; (2) the article mentions Agent datasets (Tool use, Multi-step reasoning) but the actual implementation only provides multi-turn conversation-based agent datasets, not single-turn tool-use scenarios as the naming might suggest.

## Findings
### Finding 1 — RAG dataset listing incomplete
- **Type:** Reference
- **Status:** ⚠️ partial
- **Doc says:** "For retrieval-augmented generation systems: Product Documentation, Research Papers, Wikipedia" (block 9-10)
- **Reality:** The system contains additional RAG datasets not mentioned: `rag_document_qa_multiturn.json`, `rag_knowledge_base_multiturn.json`, `rag_research_assistant_multiturn.json`, alongside the three documented ones
- **Evidence:** `/Users/gorkemcetin/verifywise/EvaluationModule/data/datasets/rag/` contains 6 dataset files
- **Suggested fix:** Either expand the article to list all 6 RAG datasets or note "including" to indicate the list is non-exhaustive
- **Confidence:** high

### Finding 2 — Agent dataset structure mismatch
- **Type:** Behavior
- **Status:** ⚠️ partial
- **Doc says:** "For AI assistants that take actions: Tool use, Multi-step reasoning" (block 12)
- **Reality:** All three agent datasets (`agent_planning_multiturn.json`, `agent_task_execution_multiturn.json`, `agent_workflow_automation_multiturn.json`) are multi-turn conversational format, not single-turn tool-invocation scenarios. The descriptions in the doc suggest single-turn task-based examples but implementation uses conversation arrays
- **Evidence:** `/Users/gorkemcetin/verifywise/EvaluationModule/data/datasets/agent/` - all `.json` files follow the multi-turn conversation structure documented at block 25-27 (with `turns` array, not `prompt`/`expected_output` fields)
- **Suggested fix:** Clarify that agent datasets are conversation-based multi-turn evaluations for agentic workflows, not isolated tool-use examples
- **Confidence:** medium

## Verified claims (sampled)
- Claim: "Each dataset specifies its type (single-turn or multi-turn)" (block 5) — Verified at `Clients/src/infrastructure/api/deepEvalDatasetsService.ts:20` where `ListedDataset` interface includes `type?: "single-turn" | "multi-turn" | "simulated"`
- Claim: "Basic Chatbot — General-purpose prompts covering conversation, coding, math, knowledge, creative writing and reasoning. Single-turn format" (block 8) — Verified at `EvaluationModule/data/datasets/chatbot/chatbot_basic.json` exists with single-turn structure
- Claim: "Coding Helper — Programming assistance scenarios" (block 8) — Verified at `EvaluationModule/data/datasets/chatbot/chatbot_coding_helper.json` exists
- Claim: "Multi-turn datasets use a conversation array format where each item represents one turn" (block 25) — Verified at `EvaluationModule/data/datasets/chatbot/chatbot_customer_support_multiturn.json` contains `conversation` array with `role` and `content` fields
- Claim: "Built-in datasets can't be modified directly. Use 'Save copy' to create an editable version" (block 27) — Verified at `Clients/src/presentation/pages/EvalsDashboard/NewExperimentModal.tsx:274` mentions "Save copy" action for creating custom datasets

## Skipped / non-verifiable
- "Your evaluation is only as good as your dataset" (block 2) — opinion/motivation only
- "A well-crafted dataset exposes how your model handles the scenarios that actually matter" (block 2) — aspirational framing
- "Most teams do both, using built-in datasets for general benchmarking while building custom ones for application-specific testing" (block 3) — research/user behavior claim; unverifiable without user data
- "The judge LLM evaluates semantic similarity, checking whether the model's response conveys the same meaning" (block 15) — product design claim; verifiable only via documentation of judge implementation
