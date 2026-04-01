# AI Advisor System

## Overview

The AI Advisor is a multi-domain conversational interface that provides intelligent insights across VerifyWise data. It uses LLM providers (Anthropic, OpenAI, OpenRouter) with tool-calling capabilities to query and analyze risks, models, vendors, incidents, tasks, and policies.

## Key Features

- Multi-provider LLM support (Anthropic, OpenAI, OpenRouter)
- 7 specialized domains with 25 tools
- Agentic loop with tool execution
- Conversation persistence per domain
- Interactive charts (pie, bar, line, table)
- Multi-tenant data isolation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  AdvisorChat    │──│ useAdvisorRuntime│──│ Conversation│ │
│  │  Component      │  │     Hook         │  │   Context   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │ API Calls
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Express)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  advisor    │──│   agent.ts  │──│   Tool Functions    │ │
│  │  .ctrl.ts   │  │   (loop)    │  │ (7 domains × tools) │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌─────────────┐           ┌─────────────┐
       │  LLM APIs   │           │  Database   │
       │ (Anthropic, │           │ (PostgreSQL)│
       │ OpenAI, etc)│           │             │
       └─────────────┘           └─────────────┘
```

## LLM Provider Integration

### Supported Providers

| Provider | API URL | Model Examples |
|----------|---------|----------------|
| Anthropic | `https://api.anthropic.com/v1` | claude-3-opus, claude-3-sonnet |
| OpenAI | `https://api.openai.com/v1/` | gpt-4, gpt-4-turbo |
| OpenRouter | `https://openrouter.ai/api/v1/` | Various models |

### LLM Key Management

```typescript
interface ILLMKey {
  id: number;
  key: string;           // Encrypted API key
  name: LLMProvider;     // "Anthropic" | "OpenAI" | "OpenRouter"
  url?: string;          // Custom endpoint (optional)
  model: string;         // Model identifier
  created_at: Date;
}
```

Keys are:
- Stored per-tenant in `llm_keys` table
- Masked in API responses (shows only last 4 chars)
- Admin-only configuration

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/advisor` | Run advisor query |
| GET | `/advisor/conversations/:domain` | Get conversation history |
| POST | `/advisor/conversations/:domain` | Save conversation |

### Run Advisor Request

```json
{
  "prompt": "What are my high severity risks?",
  "llmKeyId": 1
}
```

### Run Advisor Response

```json
{
  "markdown": "Based on my analysis...\n\n## Summary\n...",
  "chartData": {
    "type": "pie",
    "title": "Risk Distribution",
    "data": [
      {"label": "High", "value": 10, "color": "#EF4444"},
      {"label": "Medium", "value": 25, "color": "#F59E0B"}
    ]
  }
}
```

## Agentic Loop

The agent orchestrates LLM calls and tool execution:

```
1. Receive user prompt
2. Call LLM with system prompt + tools
3. If LLM requests tool call:
   a. Execute tool function with args
   b. Return result to LLM
   c. Go to step 2
4. If LLM returns final response:
   a. Parse markdown and chart data
   b. Return to client
```

### Anthropic Implementation

```typescript
// Uses native Anthropic SDK
const response = await anthropic.messages.create({
  model: llmKey.model,
  max_tokens: 4096,
  system: systemPrompt,
  tools: convertedTools,  // OpenAI format → Anthropic format
  messages: conversationHistory
});
```

### OpenAI-Compatible Implementation

```typescript
// Works for OpenAI and OpenRouter
const client = new OpenAI({
  apiKey: llmKey.key,
  baseURL: getLLMProviderUrl(llmKey.name)
});

const response = await client.chat.completions.create({
  model: llmKey.model,
  messages: conversationHistory,
  tools: toolDefinitions,
  tool_choice: "auto"
});
```

## Available Domains & Tools

### 1. Risk Management (4 tools)

| Tool | Description |
|------|-------------|
| `fetch_risks` | Filter risks by project, severity, likelihood, category, mitigation status |
| `get_risk_analytics` | Risk matrix, category distribution, mitigation breakdown |
| `get_executive_summary` | Total risks, critical counts, top categories, urgent items |
| `get_risk_history_timeseries` | Historical trends for severity, likelihood, status |

### 2. Model Inventory (3 tools)

| Tool | Description |
|------|-------------|
| `fetch_model_inventories` | Filter by project, status, provider, security assessment |
| `get_model_inventory_analytics` | Status distribution, provider breakdown, capabilities |
| `get_model_inventory_executive_summary` | Total models, approval status, top providers |

### 3. Model Risks (3 tools)

| Tool | Description |
|------|-------------|
| `fetch_model_risks` | Filter by model, category, level, status, owner |
| `get_model_risk_analytics` | Category distribution, level breakdown, owner analysis |
| `get_model_risk_executive_summary` | Total risks, severity breakdown, urgent risks |

### 4. Vendors (4 tools)

| Tool | Description |
|------|-------------|
| `fetch_vendors` | Filter by review status, data sensitivity, criticality |
| `fetch_vendor_risks` | Get vendor-related risks by likelihood, severity |
| `get_vendor_analytics` | Review status, sensitivity breakdown, risk scores |
| `get_vendor_executive_summary` | Total vendors, high-risk vendors, compliance |

### 5. AI Incidents (3 tools)

| Tool | Description |
|------|-------------|
| `fetch_incidents` | Filter by type, severity, status, approval status |
| `get_incident_analytics` | Type distribution, severity breakdown, by project |
| `get_incident_executive_summary` | Total incidents, open count, resolution progress |

### 6. Tasks (3 tools)

| Tool | Description |
|------|-------------|
| `fetch_tasks` | Filter by status, priority, category, overdue |
| `get_task_analytics` | Status distribution, assignee workload, overdue analysis |
| `get_task_executive_summary` | Total tasks, status breakdown, tasks needing attention |

### 7. Policies (5 tools)

| Tool | Description |
|------|-------------|
| `fetch_policies` | Filter by status, tag, review due days |
| `get_policy_analytics` | Status distribution, tag distribution, review schedule |
| `get_policy_executive_summary` | Total policies, upcoming reviews, attention needed |
| `search_policy_templates` | Search templates by category, tag, keyword |
| `get_template_recommendations` | Suggestions based on coverage gaps |

## System Prompt

The advisor uses a detailed system prompt that:

1. **Defines scope**: Only answers questions about AI governance domains
2. **Specifies response format**: Markdown with optional chart data
3. **Lists available tools**: All 25 tools with parameters
4. **Sets color scheme**: Consistent colors for severity levels

### Response Format

```
[Markdown analysis section]
---CHART_DATA---
[JSON chart data or "null"]
```

### Chart Types

**Pie Chart:**
```json
{
  "type": "pie",
  "title": "Distribution",
  "data": [
    {"label": "Category A", "value": 10, "color": "#EF4444"}
  ]
}
```

**Bar Chart:**
```json
{
  "type": "bar",
  "title": "Comparison",
  "data": [
    {"label": "Item A", "value": 10}
  ]
}
```

**Line Chart:**
```json
{
  "type": "line",
  "title": "Trends",
  "xAxisLabels": ["Jan", "Feb", "Mar"],
  "series": [
    {"label": "Series A", "data": [1, 2, 3]}
  ]
}
```

**Table:**
```json
{
  "type": "table",
  "title": "Summary",
  "data": [
    {"label": "Metric", "value": 10}
  ]
}
```

### Color Scheme

| Level | Color |
|-------|-------|
| Very High/Critical | #DC2626 |
| High | #EF4444 |
| Medium | #F59E0B |
| Low | #10B981 |
| Very Low | #059669 |

## Conversation Persistence

### Data Model

```typescript
interface IAdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  chartData?: unknown;
}

interface IAdvisorConversation {
  id: number;
  user_id: number;
  domain: AdvisorDomain;
  messages: IAdvisorMessage[];
  created_at: Date;
  updated_at: Date;
}

// Maximum 50 messages per conversation
```

### Domains

```typescript
type AdvisorDomain =
  | 'risk-management'
  | 'model-inventory'
  | 'model-risks'
  | 'vendors'
  | 'ai-incident-managements'
  | 'tasks'
  | 'policies';
```

## Frontend Components

### Component Hierarchy

```
AdvisorChat
├── AdvisorChatInner
│   └── AssistantRuntimeProvider
│       └── CustomThread
│           ├── CustomComposer
│           │   └── Suggested prompts
│           └── Messages
│               └── CustomMessage
│                   ├── MessageText (Markdown)
│                   ├── MessageChart
│                   │   └── ChartRenderer
│                   └── MessageTimestamp
```

### useAdvisorRuntime Hook

Adapts between assistant-ui library and advisor API:

```typescript
const runtime = useAdvisorRuntime({
  domain: 'risk-management',
  selectedLLMKeyId: 1
});

// Internally:
// 1. Intercepts user messages
// 2. Calls advisor API
// 3. Parses response
// 4. Saves to conversation context
// 5. Returns to assistant-ui format
```

### Domain Configuration

Each domain has:
- `path`: URL path pattern
- `displayName`: UI label
- `welcomeMessage`: Initial greeting
- `placeholder`: Input placeholder text
- `suggestions`: Array of prompt suggestions

```typescript
const config = ADVISOR_DOMAINS['risk-management'];
// {
//   path: '/risk-management',
//   displayName: 'Risks',
//   welcomeMessage: "Hello! I'm your AI Risk Management Advisor...",
//   suggestions: [
//     { prompt: 'Give me an executive summary...', label: 'Summarize' }
//   ]
// }
```

## Data Access

Tools access data through utility functions:

```typescript
// Example: fetch_risks tool
async function fetchRisks(params, tenant) {
  // Use existing query utilities
  const risks = await getAllRisksQuery(tenant, 'active');

  // Apply filters
  return risks.filter(risk => {
    if (params.severity && risk.severity !== params.severity) return false;
    if (params.category && risk.risk_category !== params.category) return false;
    // ... more filters
    return true;
  });
}
```

All queries:
- Include `organizationId` parameter for multi-tenant isolation
- Use unqualified table names with `WHERE organization_id = :organizationId`
- Leverage existing utility functions

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `advisor/agent.ts` | Agentic loop orchestrator |
| `advisor/prompts.ts` | System prompt with tool list |
| `advisor/tools/*.ts` | Tool definitions (OpenAI format) |
| `advisor/functions/*.ts` | Tool implementations |
| `controllers/advisor.ctrl.ts` | API request handler |
| `controllers/llmKey.ctrl.ts` | LLM key management |
| `routes/advisor.route.ts` | Route definitions |
| `utils/llmKey.utils.ts` | Key storage and masking |

### Frontend

| File | Purpose |
|------|---------|
| `components/AdvisorChat/index.tsx` | Main chat component |
| `components/AdvisorChat/advisorConfig.ts` | Domain configuration |
| `components/AdvisorChat/useAdvisorRuntime.ts` | Chat adapter hook |
| `components/AdvisorChat/CustomMessage.tsx` | Message renderer |
| `components/AdvisorChat/ChartRenderer.tsx` | Chart visualization |
| `contexts/AdvisorConversation.context.tsx` | Conversation state |
| `repository/advisor.repository.ts` | API client |

## Error Handling

### Tool Execution Errors

```typescript
try {
  const result = await toolFunction(args, tenant);
  return { tool_call_id, output: JSON.stringify(result) };
} catch (error) {
  return { tool_call_id, output: error.message, is_error: true };
}
```

- Errors returned to LLM for interpretation
- LLM can retry or explain error to user

### Response Parsing

1. Primary: Split on `---CHART_DATA---` separator
2. Fallback: Extract from ` ```chart ``` ` code block
3. If parsing fails: Return raw response as markdown

## Performance

### Timing Instrumentation

The agent logs:
- Total agentic loop time
- Per-iteration timing
- LLM API call latency

### Frontend Optimizations

- Conversation loading prevents duplicates
- Auto-save debounced to 1 second
- Initial messages memoized
- Charts render only on valid data

## Related Documentation

- [Integrations](./integrations.md) - LLM key management
- [Authentication](../architecture/authentication.md) - JWT and access control
- [Risk Management](../domains/risk-management.md) - Risk tool data
- [Model Inventory](../domains/models.md) - Model tool data
