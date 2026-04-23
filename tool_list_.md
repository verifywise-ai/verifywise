**Complete Tool List**

GRC Platform — AI Agent Tool Catalogue

**Legend: agent\_** prefix indicates agentic (write/action) tools that modify platform data.

**Existing 47 Tools (Read-Only)**

| \# | Tool Name | Category |
| ----- | :---- | :---- |
| 1 | fetch\_risks | Risk |
| 2 | get\_risk\_analytics | Risk |
| 3 | get\_executive\_summary | Risk |
| 4 | get\_risk\_history\_timeseries | Risk |
| 5 | fetch\_model\_inventories | Model Inventory |
| 6 | get\_model\_inventory\_analytics | Model Inventory |
| 7 | get\_model\_inventory\_executive\_summary | Model Inventory |
| 8 | fetch\_model\_risks | Model Risk |
| 9 | get\_model\_risk\_analytics | Model Risk |
| 10 | get\_model\_risk\_executive\_summary | Model Risk |
| 11 | fetch\_vendors | Vendor |
| 12 | fetch\_vendor\_risks | Vendor |
| 13 | get\_vendor\_analytics | Vendor |
| 14 | get\_vendor\_executive\_summary | Vendor |
| 15 | fetch\_incidents | Incident |
| 16 | get\_incident\_analytics | Incident |
| 17 | get\_incident\_executive\_summary | Incident |
| 18 | fetch\_tasks | Task |
| 19 | get\_task\_analytics | Task |
| 20 | get\_task\_executive\_summary | Task |
| 21 | fetch\_policies | Policy |
| 22 | get\_policy\_analytics | Policy |
| 23 | get\_policy\_executive\_summary | Policy |
| 24 | search\_policy\_templates | Policy |
| 25 | get\_template\_recommendations | Policy |
| 26 | fetch\_use\_cases | Use Case |
| 27 | get\_use\_case\_analytics | Use Case |
| 28 | get\_use\_case\_executive\_summary | Use Case |
| 29 | fetch\_datasets | Dataset |
| 30 | get\_dataset\_analytics | Dataset |
| 31 | get\_dataset\_executive\_summary | Dataset |
| 32 | fetch\_frameworks | Framework |
| 33 | get\_framework\_analytics | Framework |
| 34 | fetch\_training\_records | Training |
| 35 | get\_training\_analytics | Training |
| 36 | get\_training\_executive\_summary | Training |
| 37 | fetch\_evidence | Evidence |
| 38 | get\_evidence\_analytics | Evidence |
| 39 | get\_evidence\_executive\_summary | Evidence |
| 40 | fetch\_reports | Reporting |
| 41 | get\_reporting\_analytics | Reporting |
| 42 | fetch\_trust\_center\_overview | AI Trust Centre |
| 43 | get\_trust\_center\_analytics | AI Trust Centre |
| 44 | fetch\_agent\_primitives | Agent Discovery |
| 45 | get\_agent\_discovery\_analytics | Agent Discovery |
| 46 | get\_agent\_discovery\_executive\_summary | Agent Discovery |
| 47 | generate\_chart | Native (Visualization) |

**New Tools**

**Category A: Write Tools for Existing Domains (54 tools)**

These tools extend existing domains with write / action capabilities. All are agentic (agent\_ prefix).

**A1. Risk Write Tools (7)**

| \# | Tool Name | Description | Query Used |
| ----- | :---- | :---- | :---- |
| 48 | **agent\_create\_risk** | Create new risk | createRiskQuery |
| 49 | **agent\_update\_risk** | Update risk (severity, likelihood, etc.) | updateRiskByIdQuery |
| 50 | **agent\_delete\_risk** | Delete risk (soft delete) | deleteRiskByIdQuery |
| 51 | **agent\_assign\_risk\_owner** | Assign owner to risk | updateRiskByIdQuery (owner field) |
| 52 | **agent\_change\_risk\_status** | Change mitigation status | updateRiskByIdQuery (status field) |
| 53 | **agent\_bulk\_update\_risk\_status** | Bulk update risk status | Loop updateRiskByIdQuery |
| 54 | **agent\_link\_risk\_to\_project** | Link risk to project | updateRiskByIdQuery (project field) |

**A2. Model Inventory Write Tools (6)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 55 | **agent\_register\_model** | Register new model |
| 56 | **agent\_update\_model** | Update model information |
| 57 | **agent\_update\_model\_lifecycle\_phase** | Change lifecycle phase (dev→staging→prod) |
| 58 | **agent\_retire\_model** | Retire model |
| 59 | **agent\_delete\_model** | Delete model |
| 60 | **agent\_link\_model\_to\_project** | Link model to project |

**A3. Model Risk Write Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 61 | **agent\_create\_model\_risk** | Create model risk |
| 62 | **agent\_update\_model\_risk** | Update model risk |
| 63 | **agent\_change\_model\_risk\_status** | Change risk status |
| 64 | **agent\_delete\_model\_risk** | Delete model risk |

**A4. Vendor Write Tools (7)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 65 | **agent\_create\_vendor** | Register new vendor |
| 66 | **agent\_update\_vendor** | Update vendor information |
| 67 | **agent\_delete\_vendor** | Delete vendor |
| 68 | **agent\_create\_vendor\_risk** | Create vendor risk |
| 69 | **agent\_update\_vendor\_risk** | Update vendor risk |
| 70 | **agent\_delete\_vendor\_risk** | Delete vendor risk |
| 71 | **agent\_flag\_vendor\_for\_review** | Flag vendor for review |

**A5. Incident Write Tools (5)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 72 | **agent\_create\_incident** | Create new incident |
| 73 | **agent\_update\_incident** | Update incident |
| 74 | **agent\_update\_incident\_status** | Change incident status |
| 75 | **agent\_archive\_incident** | Archive incident |
| 76 | **agent\_delete\_incident** | Delete incident |

**A6. Task Write Tools (7)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 77 | **agent\_create\_task** | Create new task |
| 78 | **agent\_update\_task** | Update task |
| 79 | **agent\_assign\_task** | Assign task to user |
| 80 | **agent\_update\_task\_status** | Change task status |
| 81 | **agent\_set\_task\_priority** | Set task priority |
| 82 | **agent\_delete\_task** | Delete task |
| 83 | **agent\_restore\_task** | Restore deleted task |

**A7. Policy Write Tools (5)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 84 | **agent\_create\_policy** | Create new policy |
| 85 | **agent\_update\_policy** | Update policy content |
| 86 | **agent\_submit\_policy\_for\_review** | Submit policy for review |
| 87 | **agent\_approve\_policy\_review** | Approve policy review |
| 88 | **agent\_delete\_policy** | Delete policy |

**A8. Use Case / Project Write Tools (5)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 89 | **agent\_create\_use\_case** | Create new use case |
| 90 | **agent\_update\_use\_case** | Update use case |
| 91 | **agent\_update\_use\_case\_status** | Change status |
| 92 | **agent\_add\_member\_to\_use\_case** | Add member |
| 93 | **agent\_delete\_use\_case** | Delete use case |

**A9. Dataset Write Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 94 | **agent\_register\_dataset** | Register new dataset |
| 95 | **agent\_update\_dataset** | Update dataset |
| 96 | **agent\_link\_dataset\_to\_model** | Link dataset to model |
| 97 | **agent\_delete\_dataset** | Delete dataset |

**A10. Training Write Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 98 | **agent\_create\_training\_record** | Create new training record |
| 99 | **agent\_update\_training\_record** | Update training record |
| 100 | **agent\_assign\_training\_to\_user** | Assign training to user |
| 101 | **agent\_delete\_training\_record** | Delete training record |

**Category B: New Domains — Read Tools (68 tools)**

Read-only tools for domains not yet covered. No agent\_ prefix.

**B1. Change History Tools (6)**

| \# | Tool Name | Description | Endpoint |
| ----- | :---- | :---- | :---- |
| 102 | get\_risk\_change\_history | Risk change history | /api/risk-change-history |
| 103 | get\_vendor\_change\_history | Vendor change history | /api/vendor-change-history |
| 104 | get\_model\_change\_history | Model change history | /api/model-inventory-change-history |
| 105 | get\_policy\_change\_history | Policy change history | /api/policy-change-history |
| 106 | get\_incident\_change\_history | Incident change history | /api/incident-change-history |
| 107 | get\_task\_change\_history | Task change history | /api/task-change-history |

**B2. Approval Workflow Tools (8)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 108 | fetch\_approval\_workflows | List all workflow templates |
| 109 | get\_approval\_workflow\_detail | Workflow detail (steps, approvers) |
| 110 | fetch\_pending\_approvals | List pending approvals |
| 111 | fetch\_my\_approval\_requests | User's own requests |
| 112 | get\_approval\_request\_detail | Request detail (timeline, status) |
| 113 | get\_approval\_status\_for\_entity | Entity approval status |
| 114 | get\_approval\_analytics | Approval statistics (avg. time, rejection rate) |
| 115 | get\_approval\_executive\_summary | Approval process summary report |

**B3. Automation Tools (7)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 116 | fetch\_automations | List all automations |
| 117 | get\_automation\_detail | Automation detail (trigger, actions) |
| 118 | fetch\_automation\_triggers | List available triggers |
| 119 | get\_automation\_history | Execution log history |
| 120 | get\_automation\_stats | Success / error rates |
| 121 | get\_automation\_analytics | General automation analytics |
| 122 | get\_automation\_executive\_summary | Automation summary report |

**B4. Post-Market Monitoring (PMM) Tools (8)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 123 | get\_pmm\_config | Project PMM configuration |
| 124 | get\_pmm\_active\_cycle | Active monitoring cycle |
| 125 | get\_pmm\_cycle\_detail | Cycle details |
| 126 | get\_pmm\_cycle\_responses | Stakeholder responses |
| 127 | get\_pmm\_questions | PMM questions |
| 128 | fetch\_pmm\_reports | PMM reports |
| 129 | get\_pmm\_analytics | PMM analytics (completion rate, flagged concerns) |
| 130 | get\_pmm\_executive\_summary | PMM summary report |

**B5. File Management Tools (6)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 131 | fetch\_files | List files (project / org level) |
| 132 | get\_file\_detail | File detail (metadata, links) |
| 133 | get\_files\_by\_entity | Files linked to entity |
| 134 | get\_file\_change\_history | File change history |
| 135 | get\_file\_analytics | File statistics (type distribution, size) |
| 136 | get\_file\_executive\_summary | File management summary |

**B6. Virtual Folder Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 137 | fetch\_virtual\_folders | List folder structure |
| 138 | get\_folder\_tree | Hierarchical folder tree |
| 139 | get\_folder\_files | Files in folder |
| 140 | get\_uncategorized\_files | Uncategorized files |

**B7. Shadow AI Tools (8)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 141 | get\_shadow\_ai\_summary | General shadow AI overview |
| 142 | get\_shadow\_ai\_tools\_by\_events | Tool usage by event |
| 143 | get\_shadow\_ai\_tools\_by\_users | Tool usage by user |
| 144 | get\_shadow\_ai\_trend | Time-based trend analysis |
| 145 | get\_shadow\_ai\_users\_by\_department | Distribution by department |
| 146 | get\_shadow\_ai\_user\_activity | Individual user activity |
| 147 | get\_shadow\_ai\_tool\_detail | Specific tool detail |
| 148 | get\_shadow\_ai\_alert\_history | Alert history |

**B8. AI Detection Tools (8)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 149 | fetch\_ai\_detection\_scans | List scan history |
| 150 | get\_ai\_detection\_scan\_detail | Scan detail (status, findings) |
| 151 | get\_ai\_detection\_findings | AI detection findings |
| 152 | get\_ai\_detection\_security\_findings | Security findings |
| 153 | get\_ai\_detection\_security\_summary | Security summary |
| 154 | get\_ai\_detection\_governance\_summary | Governance summary |
| 155 | get\_ai\_detection\_stats | General statistics |
| 156 | get\_ai\_detection\_compliance\_mapping | EU AI Act mapping |

**B9. Entity Graph Tools (5)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 157 | fetch\_entity\_annotations | All entity annotations |
| 158 | get\_entity\_annotation | Single entity annotation |
| 159 | fetch\_entity\_graph\_views | Saved graph views |
| 160 | get\_gap\_rules | Gap analysis rules |
| 161 | get\_default\_gap\_rules | Default gap rules |

**B10. Notes Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 162 | fetch\_notes | List notes (filtered) |
| 163 | get\_notes\_for\_entity | Notes belonging to entity |
| 164 | get\_note\_detail | Note detail |
| 165 | get\_notes\_analytics | Note statistics |

**B11. Notification Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 166 | fetch\_notifications | List notifications |
| 167 | get\_unread\_notification\_count | Unread notification count |
| 168 | get\_notification\_summary | Notification summary |
| 169 | get\_notification\_analytics | Notification statistics |

**Category C: New Domains — Write Tools (36 tools)**

Agentic write tools for previously uncovered domains. All have agent\_ prefix.

**C1. Approval Workflow Write Tools (5)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 170 | **agent\_create\_approval\_request** | Create approval request |
| 171 | **agent\_approve\_approval\_step** | Approve step |
| 172 | **agent\_reject\_approval\_step** | Reject step |
| 173 | **agent\_withdraw\_approval\_request** | Withdraw request |
| 174 | **agent\_create\_approval\_workflow** | Create workflow template |

**C2. Automation Write Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 175 | **agent\_create\_automation** | Create new automation rule |
| 176 | **agent\_update\_automation** | Update automation |
| 177 | **agent\_toggle\_automation** | Toggle automation on/off |
| 178 | **agent\_delete\_automation** | Delete automation |

**C3. PMM Write Tools (6)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 179 | **agent\_create\_pmm\_config** | Create PMM configuration |
| 180 | **agent\_update\_pmm\_config** | Update PMM configuration |
| 181 | **agent\_add\_pmm\_question** | Add PMM question |
| 182 | **agent\_start\_pmm\_cycle** | Start new monitoring cycle |
| 183 | **agent\_submit\_pmm\_responses** | Submit stakeholder responses |
| 184 | **agent\_flag\_pmm\_concern** | Report a concern |

**C4. File Management Write Tools (5)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 185 | **agent\_attach\_file\_to\_entity** | Attach file to entity |
| 186 | **agent\_detach\_file\_from\_entity** | Remove file attachment |
| 187 | **agent\_create\_virtual\_folder** | Create virtual folder |
| 188 | **agent\_assign\_file\_to\_folder** | Assign file to folder |
| 189 | **agent\_remove\_file\_from\_folder** | Remove file from folder |

**C5. Shadow AI Write Tools (3)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 190 | **agent\_update\_shadow\_ai\_tool\_status** | Update tool governance status |
| 191 | **agent\_start\_shadow\_ai\_governance** | Start governance process |
| 192 | **agent\_create\_shadow\_ai\_alert\_rule** | Create alert rule |

**C6. AI Detection Write Tools (3)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 193 | **agent\_start\_ai\_detection\_scan** | Start repository scan |
| 194 | **agent\_cancel\_ai\_detection\_scan** | Cancel scan |
| 195 | **agent\_update\_finding\_governance** | Update finding governance status |

**C7. Entity Graph Write Tools (4)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 196 | **agent\_create\_entity\_annotation** | Add entity annotation |
| 197 | **agent\_delete\_entity\_annotation** | Delete annotation |
| 198 | **agent\_save\_entity\_graph\_view** | Save graph view |
| 199 | **agent\_save\_gap\_rules** | Save gap rules |

**C8. Notes Write Tools (3)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 200 | **agent\_create\_note** | Create note |
| 201 | **agent\_update\_note** | Update note |
| 202 | **agent\_delete\_note** | Delete note |

**C9. Notification Write Tools (2)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 203 | **agent\_mark\_notification\_read** | Mark notification as read |
| 204 | **agent\_mark\_all\_notifications\_read** | Mark all as read |

**C10. Evidence Write Tools (3)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 205 | **agent\_create\_evidence** | Create evidence |
| 206 | **agent\_update\_evidence** | Update evidence |
| 207 | **agent\_delete\_evidence** | Delete evidence |

**Category D: Framework-Specific Tools (28 tools)**

Mixed read/write tools for specific compliance frameworks. Write tools carry agent\_ prefix.

**D1. EU AI Act Tools (7)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 208 | get\_eu\_ai\_act\_control\_categories | Get control categories |
| 209 | get\_eu\_ai\_act\_controls\_by\_category | Controls by category |
| 210 | get\_eu\_ai\_act\_project\_compliance | Project compliance status |
| 211 | get\_eu\_ai\_act\_project\_assessment | Project assessment status |
| 212 | get\_eu\_ai\_act\_compliance\_progress | Compliance progress percentage |
| 213 | **agent\_save\_eu\_ai\_act\_control** | Save / update control |
| 214 | **agent\_save\_eu\_ai\_act\_assessment\_answer** | Save assessment answer |

**D2. ISO 42001 Tools (7)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 215 | get\_iso42001\_clauses\_structure | Clause structure |
| 216 | get\_iso42001\_annexes\_structure | Annex structure |
| 217 | get\_iso42001\_project\_clauses | Project clause status |
| 218 | get\_iso42001\_project\_annexes | Project annex status |
| 219 | get\_iso42001\_progress | Progress percentage |
| 220 | **agent\_save\_iso42001\_clauses** | Save clauses |
| 221 | **agent\_save\_iso42001\_annexes** | Save annexes |

**D3. ISO 27001 Tools (7)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 222 | get\_iso27001\_clauses\_structure | Clause structure |
| 223 | get\_iso27001\_annexes\_structure | Annex structure |
| 224 | get\_iso27001\_project\_clauses | Project clause status |
| 225 | get\_iso27001\_project\_annexes | Project annex status |
| 226 | get\_iso27001\_progress | Progress percentage |
| 227 | **agent\_save\_iso27001\_clauses** | Save clauses |
| 228 | **agent\_save\_iso27001\_annexes** | Save annexes |

**D4. NIST AI RMF Tools (7)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 229 | get\_nist\_functions | List NIST functions |
| 230 | get\_nist\_categories\_by\_function | Categories by function |
| 231 | get\_nist\_subcategory\_detail | Subcategory detail |
| 232 | get\_nist\_progress | Overall progress |
| 233 | get\_nist\_progress\_by\_function | Progress by function |
| 234 | get\_nist\_status\_breakdown | Status breakdown |
| 235 | **agent\_update\_nist\_subcategory** | Update subcategory |

**Category E: Cross-Cutting / Analytics Tools (18 tools)**

Horizontal tools spanning multiple domains. Write tools carry agent\_ prefix.

**E1. Compliance & Dashboard Tools (6)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 236 | get\_compliance\_score | Overall compliance score |
| 237 | get\_compliance\_details | Detailed compliance analysis |
| 238 | get\_dashboard\_overview | Dashboard summary data |
| 239 | get\_project\_compliance\_progress | Project-level compliance |
| 240 | get\_all\_projects\_compliance | All projects compliance |
| 241 | get\_project\_stats | Project statistics |

**E2. Global Search Tools (2)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 242 | global\_search | Search across all entities |
| 243 | search\_within\_entity | Search within a specific entity type |

**E3. Share Link Tools (3)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 244 | **agent\_create\_share\_link** | Create share link |
| 245 | fetch\_share\_links | List share links |
| 246 | **agent\_revoke\_share\_link** | Revoke share link |

**E4. CE Marking Tools (2)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 247 | get\_ce\_marking\_status | CE marking status |
| 248 | **agent\_update\_ce\_marking** | Update CE marking |

**E5. Policy Linked Objects Tools (3)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 249 | get\_policy\_linked\_objects | Objects linked to policy |
| 250 | **agent\_link\_object\_to\_policy** | Link object to policy |
| 251 | **agent\_unlink\_object\_from\_policy** | Remove link |

**E6. Event Log / Audit Tools (2)**

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 252 | fetch\_event\_logs | List event logs |
| 253 | get\_audit\_trail\_for\_entity | Entity audit trail |

**Category F: Admin / Configuration Tools (12 tools)**

User, role, and integration management. Write tools carry agent\_ prefix.

| \# | Tool Name | Description |
| ----- | :---- | :---- |
| 254 | fetch\_users | List users |
| 255 | get\_user\_detail | User detail |
| 256 | get\_user\_progress | User progress |
| 257 | fetch\_roles | List roles |
| 258 | get\_organization\_detail | Organization information |
| 259 | fetch\_invitations | List invitations |
| 260 | **agent\_send\_invitation** | Send invitation |
| 261 | get\_subscription\_info | Subscription information |
| 262 | fetch\_auto\_drivers | List auto drivers |
| 263 | **agent\_run\_auto\_driver** | Run auto driver |
| 264 | fetch\_slack\_webhooks | List Slack webhooks |
| 265 | **agent\_send\_slack\_test\_message** | Send Slack test message |

**Summary**

| Category | Read Tools | Write Tools | Total |
| :---- | :---- | :---- | :---- |
| **Existing (A: Existing domains)** | 47 (existing) | 54 (new) | 101 |
| **B: Missing domain reads** | 68 (new) | — | 68 |
| **C: Missing domain writes** | — | 36 (new) | 36 |
| **D: Framework-specific** | 18 (new) | 10 (new) | 28 |
| **E: Cross-cutting** | 14 (new) | 4 (new) | 18 |
| **F: Admin / Config** | 10 (new) | 2 (new) | 12 |
| **TOTAL** | **157** | **106** | **263** |

Existing: 47 tools  →  Proposed: 263 tools  (**216 new tools**, of which **106 are agentic** — identified by the agent\_ prefix)

