# VerifyWise Technical Documentation

Welcome to the VerifyWise technical documentation. This guide helps developers understand the system architecture, codebase structure, and how to contribute effectively.

## Quick Start

- [Development Setup](../../CONTRIBUTING.md)
- [Architecture Overview](./architecture/overview.md) - Start here for system understanding
- [Feature Inventory](../feature-inventory/README.md) - Complete end-to-end map of every feature, route, API, model, test, and user guide

## Documentation Map

### Architecture & Infrastructure

Understand how the system is built.

| Document | Description |
|----------|-------------|
| [System Overview](./architecture/overview.md) | Tech stack, high-level architecture, project structure |
| [Multi-tenancy](./architecture/multi-tenancy.md) | Tenant isolation, schema design, data separation |
| [Authentication](./architecture/authentication.md) | Auth flow, JWT tokens, roles & permissions |
| [Database Schema](./architecture/database-schema.md) | ER diagrams, core tables, relationships |

### Infrastructure Services

Cross-cutting services used across the platform.

| Document | Description |
|----------|-------------|
| [Automations](./infrastructure/automations.md) | BullMQ, scheduled jobs, workers |
| [Email Service](./infrastructure/email-service.md) | MJML templates, email providers, sending |
| [File Storage](./infrastructure/file-storage.md) | Upload, storage, retrieval |
| [PDF Generation](./infrastructure/pdf-generation.md) | EJS templates, Playwright rendering |
| [External Integrations](./infrastructure/integrations.md) | MLflow, GitHub, Slack, LLM providers |
| [Plugin System](./infrastructure/plugin-system.md) | Remote plugin marketplace, installation, configuration |
| [AI Advisor](./infrastructure/ai-advisor.md) | LLM integration, tool calling, conversation |

### Frontend

React application architecture and patterns.

| Document | Description |
|----------|-------------|
| [Frontend Overview](./frontend/overview.md) | React structure, routing, state management |
| [Components](./frontend/components.md) | Shared components, usage patterns |
| [Styling](./frontend/styling.md) | Theme, design system, conventions |

### API Reference

| Document | Description |
|----------|-------------|
| [API Endpoints](./api/endpoints.md) | All REST endpoints organized by domain |

### Domain Modules

Deep-dive into specific feature areas. Each document covers data models, API endpoints, frontend components, and business logic.

| Document | Description |
|----------|-------------|
| [Use Cases](./domains/use-cases.md) | AI use case management, risk classification |
| [Risk Management](./domains/risk-management.md) | Risk identification, assessment, mitigation |
| [Compliance Frameworks](./domains/compliance-frameworks.md) | EU AI Act, ISO 42001, ISO 27001, NIST AI RMF |
| [Post-Market Monitoring](./domains/post-market-monitoring.md) | Monitoring cycles, notifications, reports |
| [Vendors](./domains/vendors.md) | Third-party vendor management |
| [Models](./domains/models.md) | AI model inventory and lifecycle |
| [Policies](./domains/policies.md) | Policy manager, templates |
| [Incidents](./domains/incidents.md) | Incident tracking and management |
| [Evidence](./domains/evidence.md) | Evidence collection and management |
| [Training](./domains/training.md) | Training registry |
| [Reporting](./domains/reporting.md) | Report generation (PDF, DOCX) |
| [Approvals](./domains/approvals.md) | Approval workflows and requests |
| [Tasks](./domains/tasks.md) | Task management, assignment, tracking |
| [Search](./domains/search.md) | Global search across all entities |
| [Notifications](./domains/notifications.md) | Real-time SSE, email, Slack notifications |
| [AI Detection](./domains/ai-detection.md) | Repository scanning, AI/ML detection |
| [Share Links](./domains/share-links.md) | Public sharing with tokenized access |
| [Dashboard](./domains/dashboard.md) | Analytics, metrics, visualizations |

### Developer Guides

How-to guides for common development tasks.

| Document | Description |
|----------|-------------|
| [Adding a New Feature](./guides/adding-new-feature.md) | Step-by-step guide for new features |
| [Adding a Compliance Framework](./guides/adding-new-framework.md) | How to add new regulatory frameworks |
| [API Conventions](./guides/api-conventions.md) | REST patterns, error handling, response formats |

### Code Standards & Patterns

Coding conventions and architectural patterns.

| Document | Description |
|----------|-------------|
| [Code Style Guide](./guides/code-style.md) | TypeScript conventions, naming, formatting |
| [Backend Patterns](./guides/backend-patterns.md) | Controller/route/utils architecture, multi-tenancy |
| [Frontend Patterns](./guides/frontend-patterns.md) | React patterns, state management, hooks |
| [Testing Guide](./guides/testing.md) | Jest, React Testing Library, mocking patterns |
| [Design Tokens](./guides/design-tokens.md) | Theme, colors, typography, spacing reference |

## Finding What You Need

| I want to... | Go to... |
|--------------|----------|
| Find any feature, its code location, and how to test it | [Feature Inventory](../feature-inventory/README.md) |
| Understand the overall system | [Architecture Overview](./architecture/overview.md) |
| Learn how auth works | [Authentication](./architecture/authentication.md) |
| Build a new feature | [Adding a New Feature](./guides/adding-new-feature.md) |
| Work on a specific domain (e.g., PMM) | [Domain docs](./domains/) |
| Send emails from my feature | [Email Service](./infrastructure/email-service.md) |
| Generate PDF reports | [PDF Generation](./infrastructure/pdf-generation.md) |
| Find an API endpoint | [API Endpoints](./api/endpoints.md) |
| Reuse UI components | [Components](./frontend/components.md) |
| Add LLM capabilities | [AI Advisor](./infrastructure/ai-advisor.md) |
| Integrate external services | [External Integrations](./infrastructure/integrations.md) |
| Extend platform with plugins | [Plugin System](./infrastructure/plugin-system.md) |
| Implement real-time notifications | [Notifications](./domains/notifications.md) |
| Add dashboard metrics | [Dashboard](./domains/dashboard.md) |
| Scan repositories for AI usage | [AI Detection](./domains/ai-detection.md) |
| Follow coding standards | [Code Style Guide](./guides/code-style.md) |
| Learn backend architecture | [Backend Patterns](./guides/backend-patterns.md) |
| Learn React patterns | [Frontend Patterns](./guides/frontend-patterns.md) |
| Write tests | [Testing Guide](./guides/testing.md) |
| Find design tokens/colors | [Design Tokens](./guides/design-tokens.md) |

## Repository Structure

```
verifywise/
├── Clients/                 # React frontend application
│   └── src/
│       ├── application/     # Business logic, hooks, services
│       ├── domain/          # TypeScript interfaces, types
│       ├── infrastructure/  # API clients, external services
│       └── presentation/    # React components, pages
│
├── Servers/                 # Node.js backend application
│   ├── controllers/         # Request handlers
│   ├── routes/              # API route definitions
│   ├── services/            # Business logic services
│   ├── utils/               # Database queries, helpers
│   ├── domain.layer/        # Models, interfaces
│   ├── database/            # Migrations, config
│   └── templates/           # Email (MJML) and PDF (EJS) templates
│
└── docs/                    # Documentation
    └── technical/           # This documentation
```

## Contributing to Documentation

When adding or modifying features, please update the relevant documentation:

1. **New feature?** Update the domain doc or create a new one, and add or update the entry in [`docs/feature-inventory/`](../feature-inventory/README.md)
2. **New API endpoint?** Add to `api/endpoints.md` and `docs/feature-inventory/backend-features.md`
3. **New page or route?** Add to `docs/feature-inventory/frontend-features.md` and `docs/feature-inventory/feature-matrix.md`
4. **New shared component?** Add to `frontend/components.md`
5. **Changed auth/permissions?** Update `architecture/authentication.md` and `docs/feature-inventory/backend-features.md`

Documentation should be updated in the same PR as code changes.
