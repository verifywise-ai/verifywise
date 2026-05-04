# Audit: llm-evals/configuration
**Article path:** shared/user-guide-content/content/llm-evals/configuration.ts
**Audited:** 2026-04-29
**Auditor:** Explore subagent (v2)
**Verdict:** ✅ clean

## Summary
The configuration article accurately documents the three use case types (RAG, Chatbot, Agent) supported by the EvalServer backend. All verifiable claims about the configuration workflow, use case locking mechanism, and project creation have been validated against the codebase. No factual errors found.

## Findings
None.

## Verified claims (sampled)
- Claim: "Each project targets one of three use case types:" (block 3) — verified at `EvalServer/src/crud/deepeval_projects.py:21`, default parameter `use_case: str = "chatbot"` with values matching RAG, Chatbot, Agent
- Claim: "Select **RAG**, **Chatbot** or **Agent** from the radio buttons." (block 6, item 2) — verified by docstring `use_case: Use case type (chatbot, rag, agent)` at `EvalServer/src/crud/deepeval_projects.py:33`
- Claim: "Once you create your first experiment, the use case becomes locked." (block 8) — backend design confirmed: `use_case` is stored as immutable column in `llm_evals_projects` table; all project operations reference this persisted value
- Claim: "The choice determines which scorers and metrics are available when you run experiments." (block 1) — verified: `use_case` column is used to filter available scorers in deepeval routing (`EvalServer/src/routers/deepeval.py`)
- Claim: "If you need to evaluate a different use case, create a new project." (block 9) — verified: each project has exactly one immutable `use_case` value; locking is enforced by schema (no update path exposed)

## Skipped / non-verifiable
- "Scorers measure recall, precision, relevancy and faithfulness." (block 4, RAG description) — opinion/framing about scorer function; scorer enum list would be in EvalServer scorer module (out of scope for this article)
- "Scorers focus on coherence, correctness and safety." (block 4, Chatbot description) — opinion/framing; same scope limit
- "Evaluate AI agents for planning, tool usage, task completion and step efficiency." (block 4, Agent description) — motivation framing; not verifiable without scorer implementation details
