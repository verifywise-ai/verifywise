# Parallel Multi-Agent Advisor — Design

> **Date:** 2026-07-08
> **Status:** Approved (design), pre-implementation
> **Area:** `Servers/advisor` (backend) + `Clients/src/presentation/components/AdvisorChat` (frontend)

## Problem / Context

The AI advisor today is a **single** AI-SDK agent (`advisor/aiSdkAgent.ts`) holding all ~40 domain tool sets merged into one catalog, using multi-step tool calling (`stopWhen: stepCountIs(12)`). A single prompt with multiple tasks IS satisfied — but by one agent calling tools **sequentially** within one turn, not by multiple agents working in parallel.

A multi-agent network exists (`advisor/network/routingEngine.ts` `executeMultiAgent`, `advisor/agents/coordinator.agent.ts`) but is **dead code**: it is bootstrapped at startup yet never invoked from any request path, and its domain agents are **stubs** — `advisor/agents/baseAgent.ts:44-54` `handleMessage` returns a placeholder string (`"[risk-agent] Processing: ..."`), makes no LLM call, executes no tools, and covers only 6 domains.

## Goal

Give the advisor **real parallel multi-agent** execution: when a user prompt contains multiple **independent** tasks, decompose it, run the tasks concurrently through full-capability advisor workers, and merge the results into one coherent answer — without regressing the existing single-agent flow.

## Chosen Architecture — Orchestrator / Workers

```
user prompt
   │
   ▼
[PLANNER]  one LLM call → { mode: "single" | "parallel", subtasks: string[] }
   │
   ├─ mode = "single"    → existing single-agent path (streamAdvisorV2). No regression.
   │
   └─ mode = "parallel"  → Promise.all( subtasks.map(runAdvisorAiSdk) )   ← K workers, concurrency-capped
                             each worker = the FULL 40-domain advisor on one subtask
                                │
                                ▼
                          [SYNTHESIZER]  streamText( original prompt + worker results )
                                → one merged answer, streamed via AI-SDK protocol
```

Rationale: reuses `runAdvisorAiSdk` (already `Promise<string>`, stateless, safe to run concurrently) as the worker, so every worker keeps full tool coverage and the existing approval gateway. The stub 6-agent network is **not** used (left as dead code; separate cleanup optional).

## Components

### 1. Planner — `advisor/orchestrator/planner.ts`
```ts
export interface AdvisorPlan {
  mode: "single" | "parallel";
  subtasks: string[];   // for "single": [originalPrompt]; for "parallel": ≥2 independent subtasks
  reasoning: string;
}
export async function planSubtasks(
  prompt: string,
  model: LanguageModel,        // built from the org's LLM key, same as workers
): Promise<AdvisorPlan>;
```
- One `generateText`/structured call. System prompt instructs: split ONLY when the request contains multiple **independent** goals (no data dependency between them); otherwise return `mode:"single"`. Dependent chains (“do X then use its result for Y”) stay `single`.
- Hard caps: at most `MAX_SUBTASKS` (6) subtasks; if the model returns 0/1 subtask → `single`.
- On any parse/LLM failure → return `{ mode:"single", subtasks:[prompt] }` (safe fallback).

### 2. Orchestrator — `advisor/orchestrator/orchestrator.ts`
```ts
export async function runParallel(
  subtasks: string[],
  agentParams: AiSdkAdvisorParams,   // the same params the controller builds today
  opts?: { concurrency?: number },   // default 4
): Promise<Array<{ subtask: string; result: string; status: "ok" | "error"; error?: string }>>;
```
- Fans out with a concurrency cap (default 4). Each item calls `runAdvisorAiSdk({ ...agentParams, userPrompt: subtask })`. A worker throw is caught → `{ status:"error", error }` (never rejects the whole batch).

```ts
export async function synthesize(
  prompt: string,
  workerResults: Array<{ subtask: string; result: string; status: string }>,
  model: LanguageModel,
): StreamTextResult;   // returns the streamText result so the controller can pipe it
```
- `streamText` with a system prompt: “merge these per-subtask results into ONE coherent answer to the user’s original request; do not mention subtasks/agents.” Emits the AI-SDK UI-message stream.

### 3. Endpoint integration — `controllers/advisor.ctrl.ts` (`streamAdvisorV2`)
- Read `req.body.parallel === true`. When absent/false → **unchanged** current behavior.
- When true: extract the last user message as `prompt`; `planSubtasks`; if `single` → fall through to the existing `getStreamTextResult(...).pipeUIMessageStreamToResponse(res)` path; if `parallel` → `runParallel` then `synthesize(...).pipeUIMessageStreamToResponse(res, { onError })`.
- Same auth (`authenticateJWT`), same route (`POST /api/advisor/chat`), same response protocol → frontend transport unchanged.

### 4. Frontend — `AdvisorChat`
- Add a **"Parallel agents"** toggle (boolean state). Pass it into the `DefaultChatTransport` body as `{ parallel: <bool> }` (transport already forwards `llmKeyId` in body; add one field). No transport/protocol rewrite.

## Data Flow (parallel case)
1. Client POSTs `/api/advisor/chat` with `{ messages, llmKeyId, parallel: true }`.
2. Controller builds `agentParams` (LLM key, tools, tenant, userId, sessionId) exactly as today.
3. `planSubtasks(prompt, model)` → `parallel` + N subtasks.
4. `runParallel(subtasks, agentParams)` → N worker strings (concurrency ≤ 4).
5. `synthesize(prompt, results, model)` → streamed merged answer piped to the client.

## Error Handling & Fallback
- Planner failure or `mode:"single"` → existing single-agent stream (no regression).
- Individual worker failure → captured as an error result; synthesizer still runs with the successful ones and notes the gap. If **all** workers error → synthesizer produces a graceful failure message.
- Synthesizer stream errors → existing `onError` mapping (invalid key / rate-limit / provider 5xx) reused.

## Safety
- **Concurrency cap** bounds parallel LLM calls (cost/latency).
- **Approval gateway unchanged**: workers use the same `availableTools`, so write actions (`agent_create_*`) still route through the existing approval flow per worker.
- **Fallback-first**: any failure degrades to single-agent, never a hard error.
- Planner/synthesizer use the same org LLM key (no new secrets/config).

## Non-Goals (YAGNI)
- No dependency-graph / multi-wave scheduling (dependent tasks stay `single`).
- No reuse/repair of the stub 6-agent network (dead code stays; optional separate cleanup).
- No per-worker token streaming to the client (workers run to completion server-side; only the final synthesis streams).
- No new persistence/schema. Conversation persistence is unchanged (final answer saved as today).

## Testing Strategy (TDD — write tests first)
Backend (Jest), LLM mocked:
1. `planSubtasks`: multi-independent prompt → `parallel` with ≥2 subtasks; single/dependent prompt → `single`; malformed LLM output → `single` fallback; >6 subtasks clamped.
2. `runParallel`: fan-out returns one result per subtask; respects concurrency cap; a throwing worker yields `status:"error"` without failing the batch.
3. `synthesize`: called with worker results → returns a stream; system prompt includes all results.
4. `streamAdvisorV2` branch: `parallel:false`/absent → single path (existing tests stay green); `parallel:true` + `single` plan → single path; `parallel:true` + `parallel` plan → orchestrated path invoked.
Frontend (Vitest): toggle renders; toggling sends `parallel` in the transport body.

## File-Level Change List
- **New:** `Servers/advisor/orchestrator/planner.ts`, `Servers/advisor/orchestrator/orchestrator.ts`, `Servers/advisor/orchestrator/index.ts`
- **New tests:** `Servers/advisor/orchestrator/__tests__/planner.test.ts`, `.../orchestrator.test.ts`, controller branch test
- **Edit:** `Servers/controllers/advisor.ctrl.ts` (`streamAdvisorV2` — add `parallel` branch)
- **Edit:** `Clients/src/presentation/components/AdvisorChat/*` (toggle + transport body field) + a small frontend test
- **Reuse (no change):** `Servers/advisor/aiSdkAgent.ts` (`runAdvisorAiSdk`, `getStreamTextResult`, model builder)

## Trade-offs (accepted)
- Parallel prompt cost = 1 planner + K workers + 1 synthesizer LLM calls (vs. 1 single-agent call). Justified only for genuinely independent multi-task prompts — hence the planner gate + `single` default.
- Latency for parallel = planner + max(worker) + synthesizer, i.e. better than sequential sum when K≥2.
