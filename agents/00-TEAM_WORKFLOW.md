# Team Workflow Orchestration — Expanded Edition

## Overview

This document defines the end-to-end workflow for the expanded VerifyWise agent roster. It governs how a large, cross-functional software company of AI agents collaborates on any task — from an initial request through post-launch evolution. The workflow is **interactive**: at every phase gate, the Orchestrator pauses, presents evidence and choices, and waits for user approval before advancing.

The depth and duration of each phase scales with task complexity, but the sequence and gate discipline never change.

---

## Workflow Lifecycle

```
REQUEST
  │
  ▼
Phase 0  Bootstrap → Load agents, standards, and context
  │
  ▼
Phase 1  Opportunity & Request Intake → Define what and why
  │
  ▼
Phase 2  Discovery & Research → Validate assumptions
  │
  ▼
Phase 3  Strategy & Architecture → Choose how
  │
  ▼
Phase 4  Design & Experience → Specify the experience
  │
  ▼
Phase 5  Planning & Task Decomposition → Build the execution map
  │
  ▼
Phase 6  Implementation Cycles → Build in waves
  │     6A Foundation → 6B Feature Build → 6C Integration → 6D Polish
  │
  ▼
Phase 7  Quality & Security Validation → Prove readiness
  │
  ▼
Phase 8  Code Review & Knowledge Hardening → Learn and document
  │
  ▼
Phase 9  Release Readiness → Prepare to ship
  │
  ▼
Phase 10 Deployment & Launch → Ship and watch
  │
  ▼
Phase 11 Operate & Evolve → Support and iterate
  │
  ▼
Phase 12 Retrospective & Portfolio Closure → Capture learning
```

---

## Phase 0: Bootstrap

**Owner:** Orchestrator
**Goal:** Load the full agent roster, coding standards, UI/UX standards, and the user's initial context before any execution.

### Actions

1. Recursively read every `.md` file in `agents/`.
2. Load `roster.json` as the canonical agent index.
3. Read `CodeRules/` and `Clients/src/presentation/pages/StyleGuide/` recursively.
4. Initialize `MULTI_AGENT_PLAN.md` with sections for Task Board, API Contracts, Design Decisions, Risk & Blocker Log, Quality Dashboard, Change Log, and Retrospective Notes.
5. Confirm readiness to the user and ask the default intake questions.

### Gate Q0: Bootstrap Complete

Required: all standards loaded, agent roster indexed, plan document initialized.

---

## Phase 1: Opportunity & Request Intake

**Owner:** Product Manager (lead), Business Analyst, Product Analyst
**Duration:** 1 cycle

### Actions

1. Analyze the request against roadmap, user needs, and business objectives.
2. Write a **Product Requirements Document (PRD)** / Opportunity Brief containing:
   - Problem statement and user impact
   - Success metrics (quantitative, measurable)
   - Scope and explicit out-of-scope boundaries
   - User stories with acceptance criteria
   - Priority classification (Critical / High / Medium / Low)
   - Dependencies, constraints, and known risks
3. Classify task size:
   - **Small** — single component/layer, < 1 day
   - **Medium** — multiple components, 1–3 days
   - **Large** — cross-cutting feature, 3–7 days
   - **Enterprise** — strategic or multi-team initiative, > 1 week

### Handoff

Product Manager passes the approved PRD to Discovery & Research agents and Architecture agents in parallel.

### Gate Q1: PRD Approved

Required: acceptance criteria defined, success metrics set, priority and size assigned, user scope confirmed by user.

---

## Phase 2: Discovery & Research

**Owner:** User Researcher (lead), Product Analyst, Security Engineer (early scan), Compliance/Privacy agents (if regulated)
**Duration:** 1–2 cycles

### Actions

1. Conduct rapid user research, competitive analysis, and data review.
2. Produce a **Discovery Synthesis**:
   - User insights, personas, and journey maps
   - Behavioral baselines and existing metric benchmarks
   - Early security, privacy, and compliance risks
   - Open questions and recommended next steps
3. If risks are found, flag them to the Orchestrator for Phase 3 mitigation planning.

### Handoff

Discovery Synthesis + PRD are passed to Strategy & Architecture.

### Gate Q2: Discovery Accepted

Required: research findings reviewed, risks acknowledged, scope adjustments agreed by user.

---

## Phase 3: Strategy & Architecture

**Owner:** Technical Lead (lead), Solutions Architect, Software Architect, CTO (for major decisions), AI/ML or Data Engineer (if applicable), Security Engineer
**Duration:** 1–2 cycles

### Actions

1. Review the PRD and Discovery Synthesis for technical feasibility.
2. Identify affected layers, modules, files, data model changes, API changes, and integrations.
3. Produce an **Architecture Brief**:
   - High-level approach and rationale
   - 2–3 options with trade-offs and a recommendation
   - Data model and API contract changes
   - Breaking change assessment
   - Security, privacy, and compliance design
   - Risk register and unknowns
4. Write ADRs for significant technology or design decisions.

### Alignment Checkpoint

- Resolve conflicts between architecture and business constraints.
- Escalate unresolved trade-offs to the CTO / user.

### Handoff

Architecture Brief is passed to Design & Experience and Planning.

### Gate Q3: Architecture Direction Chosen

Required: user has selected an architecture option, risks accepted, ADRs approved.

---

## Phase 4: Design & Experience

**Owner:** UX/UI Designer (lead), Interaction Designer, Visual Designer, Design Systems Lead, UX Writer, Accessibility Engineer, Brand Designer
**Duration:** 1–3 cycles

### Actions

1. Review PRD and Architecture Brief.
2. Identify affected screens, flows, components, and design-system impact.
3. Produce:
   - User flows and task flows
   - Wireframes or high-fidelity mockups
   - Interactive prototypes
   - Component specs with full state inventory
   - Content, microcopy, and accessibility annotations
   - Responsive breakpoint specifications

### Alignment Checkpoint

- If a design is technically infeasible, the Designer proposes alternatives.
- If a technical approach degrades UX, the Technical Lead proposes alternatives.
- Accessibility Engineer reviews specs before handoff.

### Handoff

Design Package is combined with Architecture Brief into the **Implementation Package**.

### Gate Q4: Design Approved

Required: mockups/prototypes complete, state inventory defined, accessibility notes included, user approves design.

---

## Phase 5: Planning & Task Decomposition

**Owner:** Technical Lead (lead), Engineering Manager, Engineering Project Manager, Scrum Master / Release Train Engineer
**Duration:** 1 cycle

### Actions

1. Decompose the Implementation Package into atomic tasks:
   - Assignable to a single agent
   - Completable in one focused session
   - Independently testable
   - Clear inputs, outputs, and acceptance criteria
2. Build the dependency graph and identify parallel vs. sequential work.
3. Group tasks into waves and implementation cycles (6A–6D).
4. Assign agents using the Dispatch Matrix in `agent.md`.
5. Produce the **Task Board** in `MULTI_AGENT_PLAN.md`:
   - Task ID
   - Title
   - Owner agent
   - Wave / cycle
   - Dependencies
   - Estimated effort
   - Acceptance criteria
   - Expected files to create or modify

### Handoff

Task Board is published to all agents.

### Gate Q5: Task Board Approved

Required: all tasks atomic, dependencies mapped, estimates provided, wave order approved by user.

---

## Phase 6: Implementation Cycles

**Owners:** All Development Agents (parallel where dependencies allow)
**Duration:** Variable; longest phase

Implementation is split into four cycles so the user can steer frequently.

### Cycle 6A — Foundation

**Goal:** Establish the secure, observable skeleton of the feature.

| Agent | Typical Tasks |
|-------|---------------|
| Senior Backend Developer | Domain entities, migrations, core schemas |
| API Platform Engineer / Senior Backend | API contracts, base endpoints |
| Senior Frontend Developer | Component scaffold, state skeleton, design-system wiring |
| DevOps Engineer / Platform Engineer | CI updates, feature environments, infra scaffolding |
| QA Engineer | Test plan, test-data strategy, acceptance-test stubs |
| Application Security Engineer | Threat model review, auth/authz design review |

### Cycle 6B — Feature Build

**Goal:** Implement the functional feature set.

| Agent | Typical Tasks |
|-------|---------------|
| Mid / Junior Backend Developers | CRUD endpoints, business logic, integrations |
| Mid / Junior Frontend Developers | Components, forms, tables, API wiring |
| AI/ML Engineer / Data Engineer | Model inference, pipelines, feature stores |
| UX Writer / Content Strategist | Final copy, error messages, empty states |
| Accessibility Engineer | Early accessibility audits |

### Cycle 6C — Integration

**Goal:** Connect frontend to backend and validate end-to-end data flow.

| Agent | Typical Tasks |
|-------|---------------|
| Full-Stack Developer / Senior Developers | Wire frontend to backend APIs |
| API Platform Engineer | Contract conformance checks |
| Security Tester | Security regression tests |
| DevOps Engineer | Integration environment, smoke tests |
| QA Engineer | Integration and E2E test execution |

### Cycle 6D — Polish & Optimization

**Goal:** Harden performance, accessibility, docs, and release readiness.

| Agent | Typical Tasks |
|-------|---------------|
| Frontend Performance Engineer | Core Web Vitals, bundle optimization |
| Performance Test Engineer | Load/stress testing |
| Accessibility Engineer | WCAG audit and remediation |
| Technical Writer | Docs, runbooks, API reference updates |
| Release Manager | Release notes, versioning, deployment plan |

### Execution Rules for All Cycles

1. **Before starting:** read the task, acceptance criteria, dependencies, and prior artifacts.
2. **During implementation:** follow coding standards, architecture patterns, and design specs.
3. **Write tests as you build:** unit, integration, contract, and E2E as appropriate.
4. **After completing:** run linting, type checking, and tests locally; update MULTI_AGENT_PLAN.md status.
5. **If blocked:** notify the Orchestrator immediately with context and what is needed.

### API Contract Protocol

When frontend and backend tasks share a boundary:

1. Backend agent publishes the contract first (endpoint, method, request/response schema, errors).
2. Frontend agent reviews and confirms or requests changes.
3. Both implement against the agreed contract independently.
4. Neither side changes the contract without notifying the other and updating the contract document.

### Cycle Review Gate (after each cycle)

The Orchestrator reports:

```
Cycle [6X] Review
─────────────────
  Completed: [tasks]
  Blocked:   [tasks + reason]
  Tests:     [pass/fail]
  Risks:     [new or updated]
```

Then asks the user:

- Proceed to the next cycle?
- Rework anything first?
- Add or remove scope?

Wait for approval before continuing.

### Gate Q6: Implementation Complete

Required: all cycles done, tests passing, lint/type checks clean, acceptance criteria self-verified, MULTI_AGENT_PLAN.md updated.

---

## Phase 7: Quality & Security Validation

**Owner:** QA Engineer (lead), Test Automation Engineer, Manual QA Analyst, Performance Test Engineer, Security Tester, Accessibility Engineer, Application Security Engineer
**Duration:** 1–2 cycles

### Actions

1. **Acceptance Testing** — verify every user-story acceptance criterion.
2. **Integration Testing** — run full feature end-to-end across layers.
3. **Exploratory Testing** — edge cases, unusual flows, rapid interactions, invalid inputs, network failures.
4. **Regression Testing** — run the full regression suite.
5. **Cross-browser / Cross-device Testing** — verify frontend across targets.
6. **Accessibility Testing** — keyboard navigation, screen readers, contrast, focus management.
7. **Performance Testing** — load, stress, soak, and benchmark critical paths.
8. **Security Validation** — dependency scans, DAST, auth/authz checks, input validation.

### QA Feedback Loop

```
QA tests
   │
   ├── All pass → Gate Q7
   │
   └── Issues found
          │
          ▼
   Bug reports filed with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Severity and environment
   - Evidence (logs, screenshots, metrics)
          │
          ▼
   Assigned back to original author
          │
          ▼
   Fix + regression test
          │
          ▼
   Re-test (max 3 iterations)
          │
   Same issue 3+ times → escalate to Technical Lead
```

### Gate Q7: QA Sign-Off

Required: all acceptance criteria verified, no open Critical/High bugs, regression suite passing, security/accessibility/performance gates met.

---

## Phase 8: Code Review & Knowledge Hardening

**Owner:** Technical Lead + Peer Reviewers + Application Security Engineer + Technical Writer
**Duration:** 1 cycle

### Review Routing

| Code Author | Primary Reviewer | Secondary Reviewer |
|-------------|------------------|--------------------|
| Junior Frontend Developer | Senior Frontend Developer | Mid Frontend Developer |
| Mid Frontend Developer | Senior Frontend Developer | Technical Lead (arch changes) |
| Senior Frontend Developer | Technical Lead | UX/UI Designer or Accessibility Engineer |
| Junior Backend Developer | Senior Backend Developer | Mid Backend Developer |
| Mid Backend Developer | Senior Backend Developer | Technical Lead (arch changes) |
| Senior Backend Developer | Technical Lead | Application Security Engineer |
| AI/ML Engineer | Technical Lead | Data Scientist / Solutions Architect |
| Data Engineer | Analytics Engineer / Technical Lead | Security Engineer |
| DevOps / SRE / Platform | Senior Backend / Cloud Architect | Security Engineer |
| Security Engineer | CTO / Technical Lead | Application Security Engineer |
| Technical Writer | Technical Lead | Subject-matter expert |

### Review Checklist

1. **Correctness** against acceptance criteria
2. **Architecture** — right layer, right pattern, no accidental complexity
3. **Security** — input validation, auth/authz, injection risks, secrets handling
4. **Performance** — queries, renders, payload sizes, caching
5. **Testability** — meaningful tests covering happy path and edge cases
6. **Readability** — naming, comments, structure
7. **Consistency** — coding standards, UI/UX standards, design system
8. **Documentation** — updated docs, runbooks, API reference

### Review Iteration Loop

```
Author submits
   │
   ▼
Reviewer evaluates
   │
   ├── Approved → Gate Q8
   │
   └── Changes Requested
          │
          ▼
   Author addresses feedback
          │
          ▼
   Re-submit (max 3 rounds)
          │
   Unresolved after 3 → Technical Lead pair session
```

### Gate Q8: Code Review Approved

Required: all review comments addressed, reviewer approvals granted, docs updated.

---

## Phase 9: Release Readiness

**Owner:** Release Manager (lead), DevOps Engineer, DevSecOps Engineer, SRE, Compliance Officer
**Duration:** 1 cycle

### Actions

1. **Pre-deployment Checklist**
   - All code reviews approved
   - QA sign-off received
   - Database migrations tested in staging
   - Secrets and environment variables configured
   - Rollback procedure documented and tested
   - Monitoring, alerting, and feature flags configured
   - Compliance / CAB sign-off (if required)
2. **Release Plan**
   - Version, branching, and artifact strategy
   - Deployment sequence and timing
   - Communication plan
   - Rollback triggers

### Gate Q9: Release Approved

Required: checklist complete, rollback tested, monitoring ready, user approves release to staging/production.

---

## Phase 10: Deployment & Launch

**Owner:** DevOps Engineer (lead), SRE, Incident Commander (on standby), Support Engineer, Product Marketing Manager
**Duration:** 1 cycle

### Actions

1. **Staging Deployment**
   - Deploy to staging
   - Run automated smoke tests
   - QA sanity check
   - Product Manager validates against PRD
   - User review in staging
2. **Production Deployment**
   - Use blue-green, canary, or rolling strategy
   - Monitor error rates, latency, business metrics
   - 30-minute minimum watch window
3. **Launch Communications**
   - Release notes, changelogs, stakeholder announcements
   - Support runbook updates

### Rollback Triggers

Rollback immediately if:
- Error rate increases >2x baseline
- P95 latency exceeds 2x baseline
- Critical bug discovered
- Data integrity issue detected
- Health check failures exceed threshold

### Gate Q10: Production Stable

Required: staging validated, production deployed, monitoring green for 30 minutes, user confirms stability.

---

## Phase 11: Operate & Evolve

**Owner:** SRE (lead), Support Engineer, Customer Success Manager, Product Analyst, Engineering Manager
**Duration:** Ongoing; review after 1–2 weeks

### Actions

1. Monitor SLOs, error budgets, and user feedback.
2. Run support queue and incident response.
3. Gather adoption metrics and customer success signals.
4. Produce **Post-Launch Report**:
   - Success metrics vs PRD targets
   - Bugs and incidents
   - Customer feedback themes
   - Recommended iterations

### Gate Q11: Post-Launch Review Complete

Required: metrics reviewed, feedback synthesized, iteration priorities agreed by user.

---

## Phase 12: Retrospective & Portfolio Closure

**Owner:** Engineering Manager (lead), Product Manager, Technical Lead, all contributing agents
**Duration:** 1 cycle

### Actions

1. Validate success metrics against PRD.
2. Update architecture docs, tech-debt register, and regression suite.
3. Capture retrospectives from every agent:
   - What went well?
   - What caused friction?
   - What should change next time?
4. Archive task, update roadmap, and close `MULTI_AGENT_PLAN.md`.

### Gate Q12: Closed

Required: final summary approved by user, follow-up tasks created if needed.

---

## Iteration Patterns

### Micro Task (hotfix, typo, config change)

```
PM intake → Tech Lead assigns → Developer fixes → Peer review → QA spot-check → DevOps deploys
```
- Skip Phases 2–4 if no design/architecture impact.
- 1 cycle.

### Small Task (single component or endpoint)

```
PM intake → Tech Lead assesses → Developer builds → Peer review → QA verifies → DevOps deploys
```
- Lightweight Phases 2–4.
- 1–2 cycles.

### Medium Task (standard feature)

```
Phases 1–5 → 2–3 implementation cycles → Phase 7–8 → Phase 9–10 → Phase 12
```
- 3–6 cycles.

### Large Task (cross-cutting feature)

```
Full lifecycle → 4 implementation cycles → continuous QA → Phase 7–10 → Phase 11–12
```
- 6–12 cycles.

### Enterprise Initiative (multi-team, strategic)

```
Full lifecycle + Release Train Engineer coordination → multiple parallel tracks → formal CAB → phased rollout
```
- 12+ cycles.

---

## Communication Protocol

### Status Update Template

Every agent reports status at the end of each cycle:

```
Agent: [Role]
Task: [Task ID — Description]
Cycle: [6A / 6B / 6C / 6D]
Status: [Not Started | In Progress | Blocked | Review | Complete]
Progress: [What was accomplished this cycle]
Blockers: [What is preventing progress]
Next: [What will be done next cycle]
Artifacts: [Links to outputs]
```

### Escalation Path

```
Individual Agent
       │
       ▼ (technical blocker, approach disagreement)
Senior Agent (same discipline)
       │
       ▼ (cross-discipline conflict, architectural concern)
Technical Lead / Architect
       │
       ▼ (scope, priority, resource dispute)
Product Manager / Engineering Manager
       │
       ▼ (executive or strategic decision)
Chief Technology Officer / Director of Engineering
```

### Conflict Resolution

- **Two agents need the same file:** Technical Lead sequences changes; foundational change goes first.
- **Disagreement on approach:** escalate to Technical Lead; if unresolved, present options to user.
- **Scope creep:** flag to Product Manager and Technical Lead; user decides absorb / defer / split.
- **Security concern:** escalate immediately to Application Security Engineer / Security Engineer; do not proceed until resolved or accepted in writing.

---

## Quality Gates Summary

| Gate | Transition | Required |
|------|------------|----------|
| Q0 | Bootstrap → Phase 1 | Agents loaded, standards loaded, plan initialized |
| Q1 | Phase 1 → Phase 2 | PRD approved by user |
| Q2 | Phase 2 → Phase 3 | Discovery synthesis accepted, risks acknowledged |
| Q3 | Phase 3 → Phase 4 | Architecture direction chosen, ADRs approved |
| Q4 | Phase 4 → Phase 5 | Design package approved |
| Q5 | Phase 5 → Phase 6 | Task Board approved |
| Q6 | Phase 6 → Phase 7 | All cycles complete, tests passing, self-verified |
| Q7 | Phase 7 → Phase 8 | QA sign-off, no critical/high bugs |
| Q8 | Phase 8 → Phase 9 | Code review approved, docs updated |
| Q9 | Phase 9 → Phase 10 | Release plan approved, rollback tested |
| Q10 | Phase 10 → Phase 11 | Production stable, 30-min monitoring green |
| Q11 | Phase 11 → Phase 12 | Post-launch review complete |
| Q12 | Phase 12 → Close | Final summary approved by user |

---

## Agent Interaction Map

```
                         ┌─────────────────────────┐
                         │      Chief Technology Officer     │
                         │   Director of Engineering         │
                         └───────────┬─────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Product Manager │◄────►│  Technical Lead │◄────►│ Engineering Mgr │
│ Product Analyst │      │  Architects     │      │ Project Manager │
│ User Researcher │      │  Security Lead  │      │ Scrum Master    │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Product & Design Pod                       │
│  UX/UI Designer, Interaction Designer, Visual Designer,          │
│  Design Systems Lead, UX Writer, Accessibility Engineer,         │
│  Brand Designer, Product Marketing Manager                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Engineering Pods                             │
│  Frontend (Sr/Mid/Jr) ◄──► Backend (Sr/Mid/Jr)                 │
│  Full-Stack, Mobile, AI/ML, Data, API, Platform, Performance     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Quality, Security, Platform, Operations             │
│  QA Engineer, Test Automation, Manual QA, Performance Tester     │
│  Security Engineer, AppSec, Pentester, Compliance, Privacy       │
│  DevOps, SRE, Platform, Cloud, DevSecOps, Release Manager        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Support, Success, Data                        │
│  Support Engineer, Customer Success Manager, Incident Commander  │
│  Business Intelligence, Data Scientist, Analytics Engineer       │
└─────────────────────────────────────────────────────────────────┘
```

Arrows indicate direct collaboration channels. The Orchestrator coordinates across all groups.

---

## Anti-Patterns to Avoid

1. **Skipping the PRD.** Without clear acceptance criteria, agents interpret requirements differently.
2. **Designing during implementation.** UX decisions made mid-build create rework.
3. **Unilateral API changes.** Backend and frontend must keep the contract document in sync.
4. **Deferring tests, docs, or security.** Shift left on all three.
5. **Ignoring the dependency graph.** Starting work before dependencies complete wastes effort.
6. **Silent blockers.** Escalate within one cycle.
7. **Reviewing too late.** Small, focused changes review faster and better.
8. **Deploying without monitoring.** Every feature ships with observability.
9. **Auto-advancing through gates.** Always stop for user approval at checkpoints.
10. **One agent doing everything.** Distribute work to match expertise and reduce single points of failure.
