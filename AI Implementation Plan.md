**VerifyWise**

AI Implementation Plan

*Transforming AI Advisor into an AI Operating System*

 

Last Updated: 2026-03-11  |  Status: Approved

7 Phases  |  263 AI Tools  |  13 Technologies

 

# **Vision**

Transform the VerifyWise AI Advisor from a read-only Q\&A system into an AI Operating System capable of:

•   	Autonomous compliance operations (read \+ write)

•   	Multi-agent collaboration with specialized agents

•   	Proactive alerting and anomaly detection

•   	Natural language platform management

•   	Self-extending capabilities via MCP protocol

# **Current State**

| Area | Details |
| :---- | :---- |
| AI Advisor | 47 read-only tools, Vercel AI SDK, single agent, max 5 steps |
| Approval Workflow | 6 tables, only use\_case and file entity support |
| Automation Engine | 20+ triggers, only 1 action type (send\_email) |
| Notification Channels | Slack webhook, email (MJML), in-app (SSE \+ Redis pub/sub) |
| Job Queue | BullMQ \+ Redis, 10+ scheduled jobs |
| API Endpoint Count | \~420 endpoints |

 

# **Target State**

| Area | Target |
| :---- | :---- |
| Tool count | 263 (157 read \+ 106 write) |
| Agent count | 6+ specialized agents |
| Approval | All entity types, with auto-approve rules |
| Automation | 20+ triggers, 5+ action types |
| Notifications | Microsoft Teams \+ Slack \+ Email \+ In-app |
| AI Skills | MCP protocol for dynamic capability extension |
| Plugin Discovery | AI can search and install its own plugins |
| Observability | End-to-end agent tracing |

 

# **Technology Stack**

## **Existing (No Changes)**

| Technology | Version | Purpose |
| :---- | :---- | :---- |
| Vercel AI SDK | 6.x | LLM integration, tool calling, structured output |
| BullMQ | 5.x | Scheduled jobs, async job processing |
| Redis | 7.x | Job queue, pub/sub, caching |
| PostgreSQL | 16.x | Main database, agent memory backend |
| Slack Integration | Existing | Enterprise notification channel |
| Express.js | 4.x | Backend API framework |
| React \+ MUI | 18.x \+ 7.x | Frontend |

 

## **New Additions**

| Technology | License | Purpose | Phase |
| :---- | :---- | :---- | :---- |
| Mastra | MIT | Agent orchestration, multi-agent, memory, workflows | 2, 3, 4, 5, 6 |
| XState | MIT | Approval workflow state machine | 2 |
| json-rules-engine | MIT | Auto-approve rule engine | 2 |
| LLM Guard | MIT | Prompt injection, toxicity, PII protection | 1, 2 |
| Langfuse | MIT | Agent observability, tracing, cost tracking | 3+ |
| LangGraph.js | MIT | Graph-based compliance workflows | 6 |
| E2B | Apache 2.0 | Firecracker microVM sandbox isolation | 3+ |
| Daytona | Apache 2.0 | Docker container sandbox, parallel execution | 3+ |
| MS Teams SDK | MIT | Microsoft Teams enterprise notifications | 4 |
| MCP Protocol | Open std | AI Skills, plugin discovery, tool standard | 7 |

 

## **Removed / Not Used**

| Technology | Reason |
| :---- | :---- |
| NanoClaw | 3rd party dependency, Claude-only, not enterprise |
| Ollama | Heavy (\~4GB+ RAM), requires Docker, not suitable for enterprises |
| Composio | 3rd party dependency |
| pgvector | No RAG system planned |
| LlamaIndex.TS | No RAG system planned |
| @huggingface/transformers | No RAG system planned |
| WhatsApp / Telegram | Not enterprise — replaced with Teams \+ Slack |
| Portkey | 3rd party SaaS — replaced with in-house LLM router |

 

# **Multi-Tenancy Model**

## **Shared-Schema with organization\_id**

All AI-related tables and queries use the shared-schema model. All tables live in the verifywise PostgreSQL schema with organization\_id column for tenant isolation.

 

**Rules for all AI code:**

1\. 	Use unqualified table names (resolved via search\_path \= verifywise)

2\. 	Always include WHERE organization\_id \= :orgId in queries

3\. 	Get organizationId from req.organizationId (set by auth middleware)

4\. 	Never use schema-per-tenant patterns

 

### **Correct Pattern**

const risks \= await sequelize.query(  
  \`SELECT \* FROM project\_risks  
   WHERE organization\_id \= :orgId AND risk\_level \= 'high'\`,  
  { replacements: { orgId: req.organizationId } }  
);

 

### **BullMQ Job Tenant Context**

AsyncLocalStorage does NOT persist across BullMQ job boundaries. All proactive AI jobs (Phase 4\) must explicitly pass tenant context in job data.

 

# **AI Tool Inventory**

## **Tool Count by Category (263 Total)**

| Category | Read | Write | Total |
| :---- | :---- | :---- | :---- |
| A. Write tools for existing domains | \- | 54 | 54 |
| B. Read tools for domains without tools | 68 | \- | 68 |
| C. Write tools for domains without tools | \- | 36 | 36 |
| D. Framework-specific tools | 18 | 10 | 28 |
| E. Cross-cutting tools | 12 | 6 | 18 |
| F. Admin/config tools | 6 | 6 | 12 |
| Existing | 47 | 0 | 47 |
| Grand Total | 157 | 106 | 263 |

 

## **Category A — Write Tools for Existing Domains (54 Tools)**

| Domain | New Write Tools |
| :---- | :---- |
| Risk Management | createProjectRisk, updateProjectRisk, deleteProjectRisk, bulkUpdateRiskStatus |
| Vendor Management | createVendor, updateVendor, deleteVendor, createVendorRisk, updateVendorRisk |
| Model Inventory | createModel, updateModel, deleteModel, createModelRisk, updateModelRisk |
| Policy Management | createPolicy, updatePolicy, deletePolicy, linkPolicyToRisk, linkPolicyToEvidence |
| Task Management | createTask, updateTask, deleteTask, assignTask, bulkAssignTasks |
| Incident Management | createIncident, updateIncident, deleteIncident, updateIncidentStatus |
| Dataset Management | createDataset, updateDataset, deleteDataset |
| Training Registry | createTraining, updateTraining, deleteTraining, assignTraining |
| Evidence Hub | createEvidence, updateEvidence, deleteEvidence, linkEvidenceToEntity |
| Use Cases/Projects | createProject, updateProject, deleteProject |
| File Management | uploadFile, deleteFile, linkFileToEntity, unlinkFileFromEntity |
| Reporting | generateReport (PDF/DOCX) |
| AI Trust Centre | updateTrustCentreProfile |

 

## **Category B — Read Tools for Domains Without Tools (68 Tools)**

| Domain | New Read Tools |
| :---- | :---- |
| Approval Workflows | listWorkflows, getWorkflow, listRequests, getRequest, getRequestStatus |
| Automations | listAutomations, getAutomation, listTriggers, getActionTypes, getExecutionHistory |
| Notifications | listNotifications, getUnreadCount |
| Virtual Folders | listFolders, getFolderTree, getFolderFiles, getUncategorizedFiles |
| Share Links | listShareLinks, getShareLink, validateShareLink |
| Entity Graph | getAnnotations, getViews, getGapRules, getDefaultGapRules |
| Notes | listNotes, getNote, getNotesByEntity |
| Shadow AI | getSummary, getToolsByEvents, getUserActivity, getAlertHistory |
| AI Detection | listScans, getScanFindings, getSecurityFindings, getComplianceMapping |
| Agent Discovery | listAgents, getAgentDetails, getAgentCapabilities, getAgentRisks |
| Compliance Score | getScore, getDetails |
| Dashboard | getDashboardData |
| Search | globalSearch |

 

## **Category D — Framework-Specific Tools (28 Tools)**

| Framework | Read Tools | Write Tools |
| :---- | :---- | :---- |
| EU AI Act | listControls, getControlStatus, getAnnexes | updateControlStatus, linkEvidenceToControl |
| ISO 42001 | listClauses, getClauseStatus, getAnnexes | updateClauseStatus, linkEvidenceToClause |
| ISO 27001 | listControls, getControlStatus | updateControlStatus |
| NIST AI RMF | listSubcategories, getSubcategoryStatus | updateSubcategoryStatus |
| Plugin Frameworks | listPluginControls, getPluginControlStatus | updatePluginControlStatus, linkFileToPluginControl |

 

## **Category E — Cross-Cutting Tools (18 Tools)**

| Tool | Type | Purpose |
| :---- | :---- | :---- |
| generateComplianceReport | Read | Full compliance report across frameworks |
| compareFrameworks | Read | Side-by-side framework comparison |
| getRiskHeatmap | Read | Cross-entity risk visualization data |
| getAuditTrail | Read | Change history across entities |
| getEntityRelationships | Read | Entity graph relationships |
| bulkExport | Read | Export multiple entities to CSV/JSON |
| calculateRiskScore | Read | Aggregate risk scoring |
| getFrameworkGaps | Read | Cross-framework gap analysis |
| getOverdueItems | Read | All overdue tasks/reviews/policies |
| getUserWorkload | Read | Task/assignment load per user |
| bulkCreateRisks | Write | Bulk risk creation from template |
| bulkAssignTasks | Write | Assign tasks to multiple users |
| bulkUpdateStatus | Write | Update status for multiple entities |
| cloneProject | Write | Duplicate project with all sub-entities |
| archiveEntities | Write | Bulk archive old entities |
| sendBulkNotification | Write | Notify multiple users |

 

# **Use Case Reference**

**Full catalog: ai-use-cases.md — 171+ use cases across 15 categories**

 

## **Use Cases by Phase**

| Phase | Count | Key Categories |
| :---- | :---- | :---- |
| P1 — Write Tools | 1 | Tool definitions |
| P2 — Approval Gateway | 4 | Workflow automation, risk thresholds, human-in-the-loop |
| P3 — Multi-Agent | 28 | System discovery, risk aggregation, control mapping, dashboards |
| P4 — Proactive AI | 52 | Monitoring, anomaly detection, alerting, drift detection, vendor SLA |
| P5 — NL Control Plane | 19 | Report queries, policy drafting, auditor portal, stakeholder views |
| P6 — Compliance Autopilot | 39 | Auto-remediation, incident response, regulatory filing, fairness testing |
| P7 — AI Skills \+ MCP | 9 | CI/CD gates, IDE plugins, model registry, governance SDK |
| Cross-Phase | 19 | Cross-cutting capabilities spanning multiple phases |

 

## **Top Priority Use Cases (Must-Have)**

| Use Case | Category | Phase |
| :---- | :---- | :---- |
| Automated AI System Registry | 1 — Discovery | P4 |
| Shadow AI Discovery | 1 — Discovery | P4 |
| AIBOM Generation (SPDX 3.0) | 1 — Discovery | P4 |
| Automated Risk Scoring | 2 — Risk | P4 |
| Impact Assessment Automation (FRIA/DPIA) | 2 — Risk | P6 |
| Automated Framework Gap Analysis | 3 — Compliance | P3 |
| Control Mapping Across Frameworks | 3 — Compliance | P3 |
| Continuous Conformity Assessment (ETSI) | 3 — Compliance | P6 |
| Automated Evidence Collection | 4 — Evidence | P6 |
| Evidence Quality Scoring | 4 — Evidence | P4 |
| Audit Readiness Score | 4 — Evidence | P4 |
| Model Performance Monitoring | 6 — Monitoring | P4 |
| Prompt Injection Monitoring | 6 — Monitoring | P4 |
| Compliance Drift Alerting | 6 — Monitoring | P4 |
| Automated Incident Classification | 7 — Incidents | P4 |
| Regulatory Change Monitoring | 11 — Regulatory | P4 |
| Multi-Agent Compliance Orchestration | 13 — Workflows | P3 |
| CI/CD Governance Gates | 15 — Developer | P7 |

 

# **Phase 1 — Write Tools**

**Priority:** High

**Dependency:** None

 

## **Objective**

Extend the existing 47 read-only tools to 263 tools (read \+ write). Give AI Advisor the ability to perform CRUD operations with human confirmation for every write action.

 

## **Technologies**

| Technology | Purpose |
| :---- | :---- |
| Vercel AI SDK tool() | Tool definitions \+ multi-provider LLM routing |
| LLM Guard | Security check before write operations |
| In-house LLM Router | Tenant-based LLM key selection, retry, fallback (built on Vercel AI SDK) |

 

## **Architecture Flow**

1\. 	User sends message to AI Advisor

2\. 	Vercel AI SDK processes the request

3\. 	LLM Guard performs security check (prompt injection, toxicity, PII)

4\. 	In-house LLM Router selects tenant LLM key

5\. 	Tool execution with human confirmation dialog

6\. 	Backend API call executed on approval

 

## **Human Confirmation Flow**

1\. 	AI proposes action: "I want to create 5 new risks. Do you approve?"

2\. 	Frontend shows confirmation dialog with operation details and affected entities

3\. 	User approves or rejects

4\. 	If approved, AI executes. If rejected, AI stops.

 

## **In-House LLM Router**

Built on Vercel AI SDK multi-provider support and the existing llm\_keys table.

•   	No 3rd party SaaS dependency (replaces Portkey)

•   	Uses existing llm\_keys table (encrypted with AES-256-CBC)

•   	Supports OpenAI, Anthropic, Google, OpenRouter natively

•   	Tenant-scoped: each organization uses their own API keys

•   	Simple retry/fallback logic (\~200 lines of code)

 

## **Deliverables**

•   	263 tool definitions and implementations

•   	Human confirmation for every write operation

•   	LLM Guard prompt injection protection

•   	In-house LLM router with tenant key selection, retry, and fallback

 

# **Phase 2 — Approval Gateway**

**Priority:** High

**Dependency:** Phase 1

 

## **Objective**

Route AI operations through configurable approval workflows. Auto-approve low-risk operations, require human approval for high-risk ones.

 

## **Technologies**

| Technology | Purpose |
| :---- | :---- |
| XState | Approval state machine (pending → approved → executed) |
| json-rules-engine | Auto-approve rule engine |
| Mastra Workflows | Workflow orchestration |

 

## **State Machine Flow (XState)**

1\. 	IDLE → AI action triggered

2\. 	EVALUATE → Rule engine checks operation risk level

3\. 	Branch: AUTO\_APPROVE (low risk) | PENDING\_APPROVAL (high risk) | AUTO\_REJECT (prohibited)

4\. 	If PENDING: Human approves or rejects

5\. 	EXECUTING → Tool runs against backend API

6\. 	COMPLETED → Result logged to audit trail

 

## **Auto-Approve Rules**

•   	Read operations: always auto-approve

•   	Single entity create (low risk): auto-approve

•   	Bulk delete operations: require Admin approval

•   	Admin/config changes: require Admin approval

 

## **New Database Table: ai\_action\_approvals**

Tracks every AI action through the approval pipeline with: action\_type, tool\_name, input\_params (JSONB), risk\_level, state, rule\_matched, requested\_by, approved\_by, result (JSONB), organization\_id.

 

## **Deliverables**

•   	XState-based deterministic approval state machine

•   	Configurable auto-approve rules per tenant

•   	All entity types supported in approval workflows

•   	AI action audit trail (ai\_action\_approvals table)

 

# **Phase 3 — Multi-Agent Orchestration**

**Priority:** Medium-High

**Dependency:** Phase 1, Phase 2

 

## **Objective**

Replace the single AI Advisor agent with a network of specialized agents that collaborate on complex tasks.

 

## **Technologies**

| Technology | Purpose |
| :---- | :---- |
| Mastra Agent Network | Multi-agent orchestration |
| Mastra Memory API | Agent memory (PostgreSQL backend) |
| Langfuse | Agent tracing, cost tracking, performance monitoring |
| E2B | Agent sandbox isolation (untrusted operations) |
| Daytona | Container sandbox (parallel agent execution) |

 

## **Agent Definitions**

| Agent | Responsibility | Tool Count |
| :---- | :---- | :---- |
| Coordinator | Message routing, agent selection, result aggregation | 5 |
| Risk Agent | Risk analysis, risk creation, risk scoring | 35 |
| Compliance Agent | Framework compliance, control status, gap analysis | 40 |
| Vendor Agent | Vendor assessment, vendor risk, SLA tracking | 30 |
| Policy Agent | Policy management, linked objects, due date tracking | 25 |
| Incident Agent | Incident management, root cause analysis | 20 |
| Model Agent | Model inventory, model risk, lifecycle management | 25 |

 

## **Three-Tier Agent Memory (Mastra Memory API)**

•   	Message History: Last N messages (short-term)

•   	Working Memory: Active task info (medium-term)

•   	Semantic Recall: Past decisions and learnings (long-term)

Backend: PostgreSQL (existing database)

 

## **Observability (Langfuse)**

•   	Trace ID: end-to-end tracking

•   	Spans: each tool call

•   	LLM token usage and cost

•   	Latency metrics and error logs

•   	User feedback

 

## **Sandbox Isolation**

| Scenario | Sandbox | Reason |
| :---- | :---- | :---- |
| Untrusted code execution | E2B (Firecracker microVM) | Hardware-level isolation |
| Parallel agent operations | Daytona (Docker) | Fast containers, parallel execution |
| Normal tool calls | No sandbox | Direct API call, no overhead |

 

## **Deliverables**

•   	6+ specialized agents working together

•   	Agent-to-agent communication (Mastra Agent Network)

•   	PostgreSQL-backed long-term memory

•   	End-to-end tracing (Langfuse)

•   	Secure sandbox isolation (E2B \+ Daytona)

 

# **Phase 4 — Proactive AI**

**Priority:** Medium

**Dependency:** Phase 1, 2, 3

 

## **Objective**

AI proactively initiates actions without user requests. Anomaly detection, automatic alerts, scheduled intelligence.

 

## **Proactive Scenarios**

| Scenario | Trigger | Action | Channel |
| :---- | :---- | :---- | :---- |
| Vendor review approaching | 7 days before | Notification \+ create task | Teams \+ Slack \+ Email |
| Policy expiring | 14 days before | Notification \+ renewal reminder | Teams \+ Slack \+ Email |
| New high-risk detected | Risk level \= high | Agent analysis \+ notification | Teams \+ In-app |
| Compliance score drop | \>5% decrease | Gap analysis \+ report | Teams \+ Slack |
| Model deployed | Deployment event | Automatic risk assessment | In-app \+ Email |
| Task overdue | Due date passed | Escalation notification | Teams \+ Slack |
| Weekly digest | Every Monday 09:00 | Compliance dashboard summary | Teams \+ Slack \+ Email |

 

## **BullMQ Proactive Jobs**

| Job | Schedule |
| :---- | :---- |
| proactive\_vendor\_review\_check | Daily 08:00 |
| proactive\_policy\_expiry\_check | Daily 08:00 |
| proactive\_risk\_anomaly\_detection | Every 6 hours |
| proactive\_compliance\_score\_check | Monday 01:00 |
| proactive\_task\_overdue\_check | Daily 09:00 |
| proactive\_weekly\_digest | Monday 09:00 |

 

## **Anomaly Detection (In-House)**

PostgreSQL aggregate queries for anomaly detection — no ML libraries needed. Statistical thresholds on existing data:

1\. 	Count new high-risks in last 24 hours

2\. 	Compare to 30-day average

3\. 	Alert if \>2x above average

 

## **Deliverables**

•   	AI proactively detects anomalies and sends alerts

•   	Microsoft Teams \+ Slack \+ Email \+ In-app notification channels

•   	Scheduled intelligence reports

•   	Built on existing BullMQ infrastructure

 

# **Phase 5 — Natural Language Control Plane**

**Priority:** Medium

**Dependency:** Phase 1, 2, 3

 

## **Objective**

Manage all platform functions through natural language commands. Users speak to the AI instead of clicking through the UI.

 

## **Example Commands**

| Command | Intent | Agent | Tools |
| :---- | :---- | :---- | :---- |
| List all high-risks from last 30 days and generate a PDF report | read \+ report | Risk \+ Reporting | listRisks, generateReport |
| Start a new risk assessment for Vendor X | create | Vendor | createVendorRisk, createTask |
| Add evidence file for ISO 42001 control 7.2 | create | Compliance | linkEvidence, updateControl |
| Send this month's compliance score to Teams | read \+ notify | Compliance \+ Notif. | getScore, sendTeamsNotif |
| Assign all overdue tasks to me | update (bulk) | Coordinator | listTasks, bulkUpdateTasks |
| Summarize all changes from last week | read | Coordinator | getChangeHistory, summarize |

 

## **Multi-Step Command Flow**

Example: "Complete Vendor X risk assessment, find missing controls, and assign tasks to relevant people"

1\. 	getVendorDetails(vendorId) → Vendor Agent

2\. 	listVendorRisks(vendorId) → Risk Agent

3\. 	findMissingControls(vendorId) → Compliance Agent

4\. 	createTasksForUsers(controls) → Coordinator

5\. 	sendNotifications(assignees) → Notification

 

Approval Gateway (Phase 2\) auto-approves read operations, requires approval for bulk creates.

 

## **Deliverables**

•   	Natural language platform management

•   	Multi-step command chains

•   	Intent → Agent → Tool → Approval automatic flow

•   	UI integration (chat panel \+ command results)

 

# **Phase 6 — Compliance Autopilot**

**Priority:** Low-Medium

**Dependency:** Phase 1, 2, 3, 4, 5

 

## **Objective**

Autonomous compliance workflows. AI manages end-to-end compliance processes with minimal human intervention.

 

## **Why LangGraph.js \+ Mastra Together?**

| Approach | Use Case |
| :---- | :---- |
| Mastra Workflows | Linear, deterministic flows (assign task → send notification → generate report) |
| LangGraph.js | Cyclical, decision-tree complex flows (assess risk → incomplete? → collect more → sufficient? → escalate) |

 

## **Autopilot Workflows**

| Workflow | Trigger | Agents Involved |
| :---- | :---- | :---- |
| Model Deployment | model.status \= deployed | Risk, Compliance, Model |
| Vendor Onboarding | vendor.created | Vendor, Risk, Compliance |
| Policy Renewal | policy.due\_date \- 30 days | Policy, Compliance |
| Incident Response | incident.severity \= critical | Incident, Risk, Compliance |
| Audit Preparation | scheduled (quarterly) | All agents |
| Framework Gap Remediation | compliance\_score \< threshold | Compliance, Policy |

 

## **Example: New Model Deployment Workflow**

1\. 	Model deploy event detected

2\. 	Risk Agent performs risk assessment

3\. 	Compliance Agent checks framework controls

4\. 	If missing evidence: Model Agent creates evidence collection task

5\. 	If sufficient: Report generated

6\. 	If insufficient: Escalate to Admin

7\. 	Approval Gateway provides human oversight

 

## **Deliverables**

•   	5+ autonomous compliance workflows

•   	Graph-based decision mechanism (LangGraph.js)

•   	Human oversight at every critical point (Phase 2\)

•   	End-to-end audit trail

 

# **Phase 7 — AI Skills \+ Plugin Auto-Discovery (MCP)**

**Priority:** Low

**Dependency:** Phase 1, 2, 3

 

## **Objective**

AI discovers and extends its own capabilities via MCP protocol. Integrates with plugin-marketplace to automatically find and install new tools.

 

## **MCP Architecture**

•   	Static Tools: 263 built-in tools

•   	Dynamic Skills: MCP Runtime for runtime tool registration

•   	MCP Skill Registry stored in PostgreSQL

 

**Three types of MCP servers:**

1\. 	Built-in MCP Servers (risk, compliance, vendor, model...)

2\. 	Plugin MCP Servers (plugin-marketplace integration)

3\. 	Custom MCP Servers (tenant-specific custom skills)

 

## **Plugin Auto-Discovery Flow**

1\. 	User: "Sync my Jira tasks"

2\. 	AI checks MCP Skill Registry: Does "jira" skill exist? No.

3\. 	AI searches Plugin Marketplace: Found "jira-integration" plugin.

4\. 	AI to User: "Jira integration not available. Want me to install it?"

5\. 	User: "Yes, install it"

6\. 	Approval Gateway (Phase 2): Admin approval check

7\. 	npm install → plugin config → MCP server registration

8\. 	AI: "Jira plugin installed. Starting task sync."

9\. 	Vercel AI SDK dynamicTool → new tool active at runtime

 

## **Skill Registry Table**

PostgreSQL table: skills — with skill\_key, skill\_name, description, mcp\_server\_url, source (built-in/plugin/custom), plugin\_key, is\_active, tools (JSONB), installed\_by, organization\_id. Unique constraint on (skill\_key, organization\_id).

 

## **Deliverables**

•   	In-house MCP servers wrapping all 263 tools

•   	AI can search and install plugins (with human approval)

•   	Runtime dynamic tool registration (Vercel AI SDK dynamicTool)

•   	Tenant-scoped skill management

 

# **Phase Summary**

| Phase | Title |  | Technologies | Dependency |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Write Tools |  | Vercel AI SDK, LLM Guard, In-house LLM Router | — |
| 2 | Approval Gateway |  | XState, json-rules-engine, Mastra Workflows | Phase 1 |
| 3 | Multi-Agent |  | Mastra Agent Network, Memory, Langfuse, E2B, Daytona | Phase 1, 2 |
| 4 | Proactive AI |  | BullMQ, MS Teams SDK, Slack, Mastra Workflows | Phase 1, 2, 3 |
| 5 | NL Control Plane |  | Vercel AI SDK, Mastra Agent Network | Phase 1, 2, 3 |
| 6 | Compliance Autopilot |  | LangGraph.js, Mastra Workflows, Mastra Agent Network | Phase 1–5 |
| 7 | AI Skills \+ MCP |  | MCP Protocol, Vercel AI SDK dynamicTool, plugin-marketplace | Phase 1, 2, 3 |
| Total |   |  |   |   |

 

# **Security Layers**

| Layer | Technology | Protection |
| :---- | :---- | :---- |
| Input Security | LLM Guard | Prompt injection, toxicity, PII |
| Operation Approval | Phase 2 Approval Gateway | Unauthorized write operations |
| Sandbox Isolation | E2B \+ Daytona | Untrusted code execution |
| LLM Routing | In-house LLM Router | Tenant key selection, retry, fallback |
| Audit Trail | Change history \+ event\_logs | All operations recorded |
| Agent Monitoring | Langfuse | Agent behavior tracking |
| Tenant Isolation | Multi-tenancy (organization\_id) | Tenant data separation |

 

# **Docker Services**

| Service | Status | Port | Purpose |
| :---- | :---- | :---- | :---- |
| postgresdb | Existing | 5432 | Main database |
| redis | Existing | 6379 | Queue, pub/sub, cache |
| backend | Existing | 3000 | Express API |
| frontend | Existing | 5173 | React SPA |
| worker | Existing | — | BullMQ job processor |
| eval\_server | Existing | 8000 | LLM evaluations (optional) |
| langfuse | New | 3001 | Agent observability (Phase 3+) |
| llm-guard | New | 8800 | Safety guardrails (Phase 1+) |

 

# **Appendix: Full Technology Stack**

## **13 Technologies (4 Existing \+ 9 New)**

| \# | Technology | License | Status | Phase |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Vercel AI SDK | MIT | Existing | All |
| 2 | BullMQ | MIT | Existing | 4 |
| 3 | Slack | Existing | Existing | 4 |
| 4 | Redis \+ PostgreSQL | OSS | Existing | All |
| 5 | Mastra | MIT | New | 2, 3, 4, 5, 6 |
| 6 | XState | MIT | New | 2 |
| 7 | json-rules-engine | MIT | New | 2 |
| 8 | LLM Guard | MIT | New | 1, 2 |
| 9 | Langfuse | MIT | New | 3+ |
| 10 | LangGraph.js | MIT | New | 6 |
| 11 | E2B | Apache 2.0 | New | 3+ |
| 12 | Daytona | Apache 2.0 | New | 3+ |
| 13 | MS Teams SDK | MIT | New | 4 |
| — | MCP Protocol | Open Standard | In-house | 7 |
| — | In-house LLM Router | — | In-house | 1+ |

   
