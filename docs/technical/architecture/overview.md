# System Architecture Overview

## Introduction

VerifyWise is a full-stack AI governance platform built with a modern JavaScript/TypeScript stack. The system follows a client-server architecture with a React frontend and Node.js backend, using PostgreSQL for data persistence and Redis for caching and job queues.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Browser   │  │   Mobile    │  │  API Users  │  │  Webhooks   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React)                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Vite Dev Server / Nginx (Production)  │  Port: 5173 (dev)       │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  React 18 + Redux Toolkit + React Query + MUI v7                 │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │  │
│  │  │   Pages    │ │ Components │ │   Hooks    │ │   Context  │    │  │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (Node.js)                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Express.js Server  │  Port: 3000                                │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  Middleware: Auth │ CORS │ Rate Limit │ Multi-tenancy │ Helmet   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │  │
│  │  │   Routes    │──│ Controllers │──│  Services   │              │  │
│  │  │  (67 files) │  │ (69 files)  │  │             │              │  │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘              │  │
│  │                                           │                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────┴──────┐              │  │
│  │  │   Utils     │  │  Domain     │  │   Models    │              │  │
│  │  │ (DB Queries)│  │   Layer     │  │  (60+ ORM)  │              │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                                           │
          ▼                                           ▼
┌─────────────────────┐                   ┌─────────────────────┐
│     PostgreSQL      │                   │       Redis         │
│  ┌───────────────┐  │                   │  ┌───────────────┐  │
│  │  verifywise   │  │                   │  │  Job Queues   │  │
│  │  schema       │  │                   │  │  (BullMQ)     │  │
│  │  (all data,   │  │                   │  ├───────────────┤  │
│  │  org_id       │  │                   │  │  Pub/Sub      │  │
│  │  isolation)   │  │                   │  │  (Notifs)     │  │
│  └───────────────┘  │                   │  ├───────────────┤  │
│                      │                   │  │  Cache        │  │
└─────────────────────┘                   │  └───────────────┘  │
                                          └─────────────────────┘
```

## Tech Stack

### Frontend (`/Clients`)

| Category | Technology | Version |
|----------|------------|---------|
| Framework | React | 18.3.1 |
| Build Tool | Vite | 7.3.0 |
| Language | TypeScript | 5.x |
| State Management | Redux Toolkit | 2.11.2 |
| Server State | React Query | 5.90.15 |
| Routing | React Router | 7.11.0 |
| UI Components | Material-UI (MUI) | 7.3.6 |
| Styling | Emotion + styled-components | - |
| HTTP Client | Axios | 1.13.2 |
| Charts | Recharts, Plotly | - |
| Rich Text Editor | Tiptap, Slate, Plate | - |
| File Upload | Uppy | 4.2.x |

### Backend (`/Servers`)

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Node.js | 22.x |
| Framework | Express.js | 4.21.2 |
| Language | TypeScript | 5.x |
| ORM | Sequelize | 6.37.6 |
| Database | PostgreSQL | 8.13.0 (driver) |
| Cache/Queue | Redis + BullMQ | 5.61.0 |
| Authentication | JWT + Passport | - |
| Email | Nodemailer + MJML | - |
| PDF Generation | Playwright + EJS | - |
| Logging | Winston | 3.17.0 |

### External Services

| Service | Purpose |
|---------|---------|
| Redis | Job queues, caching, pub/sub notifications |
| PostgreSQL | Primary data store |
| Slack | Notifications integration |
| MLFlow | ML model tracking integration |
| AWS SES / Azure / Resend | Email delivery |
| OpenAI / Anthropic | AI Advisor functionality |

## Project Structure

### Backend (`/Servers`)

```
Servers/
├── index.ts                    # Entry point, Express setup
├── controllers/                # Request handlers (69 files)
├── routes/                     # API route definitions (67 files)
├── services/                   # Business logic
│   ├── automations/            # Job automation logic
│   ├── email/                  # Email service
│   ├── reporting/              # Report generation
│   ├── postMarketMonitoring/   # PMM service
│   └── ...
├── domain.layer/               # Domain models & interfaces
│   ├── models/                 # Sequelize models (60+)
│   ├── frameworks/             # Compliance framework models
│   │   ├── EU-AI-Act/
│   │   ├── ISO-42001/
│   │   ├── ISO-27001/
│   │   └── NIST-AI-RMF/
│   └── interfaces/             # TypeScript interfaces
├── middleware/                 # Express middleware
│   ├── auth.middleware.ts      # JWT authentication
│   ├── multiTenancy.middleware.ts
│   └── rateLimit.middleware.ts
├── utils/                      # Database queries, helpers
├── database/                   # DB config, migrations
│   ├── db.ts                   # Sequelize instance
│   ├── redis.ts                # Redis client
│   └── migrations/             # Schema migrations
├── templates/                  # Email (MJML) & PDF (EJS)
├── jobs/                       # BullMQ workers
│   ├── producer.ts             # Job scheduling
│   └── worker.ts               # Job processing
└── dist/                       # Compiled output
```

### Frontend (`/Clients`)

```
Clients/src/
├── main.tsx                    # Entry point
├── App.tsx                     # Root component
├── application/                # Business logic layer
│   ├── config/                 # App configuration
│   │   ├── routes.tsx          # Route definitions
│   │   └── queryClient.ts      # React Query setup
│   ├── hooks/                  # Custom hooks (50+)
│   ├── redux/                  # Redux store & slices
│   ├── repository/             # Data access (59+ repos)
│   ├── contexts/               # React contexts
│   └── constants/              # App constants
├── presentation/               # UI layer
│   ├── components/             # Reusable components (102+)
│   ├── pages/                  # Page components
│   ├── themes/                 # MUI themes
│   └── containers/             # Smart components
├── domain/                     # Domain models
│   ├── types/                  # TypeScript types
│   └── interfaces/             # Interfaces
└── infrastructure/             # Technical implementation
    └── api/                    # API services, Axios config
```

## Request Flow

```
1. User Action (Browser)
        │
        ▼
2. React Component
        │ dispatch action / call hook
        ▼
3. Redux Action / React Query
        │ API call via Axios
        ▼
4. Express Router (/api/*)
        │
        ▼
5. Middleware Chain
   ├── CORS
   ├── Rate Limiting
   ├── JWT Authentication
   ├── Multi-tenancy (tenant context)
   └── Request Validation
        │
        ▼
6. Controller
        │ business logic orchestration
        ▼
7. Service Layer
        │ complex business logic
        ▼
8. Utils (Database Queries)
        │ Sequelize ORM
        ▼
9. PostgreSQL
        │
        ▼
10. Response back through chain
```

## Key Architectural Patterns

### 1. Multi-Tenancy
- Single `verifywise` schema with `organization_id` column on tenant-scoped tables
- `req.organizationId` propagated via auth middleware
- All queries include `WHERE organization_id = :organizationId`
- See: [Multi-tenancy Documentation](./multi-tenancy.md)

### 2. Clean Architecture (Frontend)
- **Presentation Layer**: React components, pages
- **Application Layer**: Hooks, Redux, business logic
- **Domain Layer**: Types, interfaces, business rules
- **Infrastructure Layer**: API clients, external services

### 3. Layered Architecture (Backend)
- **Routes**: HTTP endpoint definitions
- **Controllers**: Request handling, validation
- **Services**: Business logic
- **Utils**: Database queries (repository pattern)
- **Models**: Sequelize ORM definitions

### 4. Event-Driven Jobs
- BullMQ for background job processing
- Scheduled jobs (cron patterns)
- Job types: Email notifications, PMM checks, Slack alerts, MLFlow sync
- See: [Automations Documentation](../infrastructure/automations.md)

### 5. State Management (Frontend)
- **Redux**: Authentication, UI state, persisted preferences
- **React Query**: Server state, API caching
- **Context API**: Legacy global state (VerifyWiseContext)

## Security Architecture

### Authentication
- JWT tokens with refresh token rotation
- Tokens stored in Redux (persisted to localStorage)
- Bearer token in Authorization header
- See: [Authentication Documentation](./authentication.md)

### Authorization
- Role-based access control (RBAC)
- Roles: Admin, Editor, Reviewer, Auditor
- Permission checks in middleware and controllers

### Data Protection
- AES-256-CBC encryption for sensitive data
- Tenant isolation prevents cross-tenant data access
- Rate limiting on API endpoints
- Input validation with express-validator
- XSS protection via Helmet

## Environment Configuration

### Backend Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=verifywise
DB_USER=verifywise
DB_PASSWORD=****

# Redis
REDIS_URL=redis://localhost:6379/0

# Authentication
JWT_SECRET=****
REFRESH_TOKEN_SECRET=****

# Multi-tenancy
MULTI_TENANCY_ENABLED=true

# Encryption
ENCRYPTION_KEY=****
ENCRYPTION_IV=****

# Email
EMAIL_PROVIDER=resend
RESEND_API_KEY=****

# Integrations
SLACK_BOT_TOKEN=****
OPENAI_API_KEY=****
```

### Frontend Environment Variables

```env
VITE_APP_API_URL=http://localhost:3000/api
VITE_APP_PORT=5173
```

## Development Workflow

### Starting Development

```bash
# Terminal 1: Backend
cd Servers
npm install
npm run watch    # Compiles TypeScript and starts server

# Terminal 2: Frontend
cd Clients
npm install
npm run dev      # Starts Vite dev server

# Terminal 3: Workers (optional)
cd Servers
npm run worker   # Starts BullMQ workers
```

### Building for Production

```bash
# Backend
cd Servers
npm run build    # Compiles to /dist

# Frontend
cd Clients
npm run build    # Builds to /dist
```

## Key Files Reference

| Purpose | Location |
|---------|----------|
| Backend entry point | `Servers/index.ts` |
| Frontend entry point | `Clients/src/main.tsx` |
| Route definitions (BE) | `Servers/routes/*.ts` |
| Route definitions (FE) | `Clients/src/application/config/routes.tsx` |
| Database models | `Servers/domain.layer/models/` |
| Redux store | `Clients/src/application/redux/store.ts` |
| API client | `Clients/src/infrastructure/api/customAxios.ts` |
| Auth middleware | `Servers/middleware/auth.middleware.ts` |
| Theme config | `Clients/src/presentation/themes/light.ts` |

## Related Documentation

- [Multi-tenancy](./multi-tenancy.md)
- [Authentication](./authentication.md)
- [Database Schema](./database-schema.md)
- [API Endpoints](../api/endpoints.md)
- [Frontend Components](../frontend/components.md)
