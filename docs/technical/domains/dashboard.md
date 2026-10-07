# Dashboard and Analytics

## Overview

The Dashboard domain provides centralized metrics, visualizations, and analytics across VerifyWise. It aggregates data from risks, vendors, policies, incidents, models, training, tasks, and use cases with time-series tracking and interactive charts.

## Key Features

- Real-time metrics aggregation
- Time-series risk history tracking
- Interactive charts (line, pie/donut)
- Executive and operations views (selection remembered per browser)
- Client-side caching with localStorage
- Organization-wide and project-specific views
- Framework compliance progress tracking

## API Endpoints

### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Main dashboard metrics |

### Risk History

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/riskHistory/timeseries` | Time-series data |
| GET | `/riskHistory/current-counts` | Current parameter counts |
| POST | `/riskHistory/snapshot` | Manual snapshot |

## Dashboard Response

```json
{
  "projects": 5,
  "trainings": 12,
  "models": 8,
  "reports": 15,
  "task_radar": {
    "overdue": 2,
    "due": 4,
    "upcoming": 8
  },
  "projects_list": [...]
}
```

## Metrics Categories

### Core Metrics

| Metric | Source | Description |
|--------|--------|-------------|
| Projects | projects | Total project count |
| Trainings | trainingregistar | Training record count |
| Models | model_inventories | AI model count |
| Reports | files | Files with 'report' source |

### Task Radar

| Category | Criteria |
|----------|----------|
| Overdue | `due_date < today` AND status not Completed/Deleted |
| Due | `due_date` within 7 days |
| Upcoming | `due_date` beyond 7 days |

### Risk Metrics

```typescript
{
  total: number;
  high: number;
  medium: number;
  low: number;
  resolved: number;
  recent: Risk[];  // Last 5 risks
}
```

### Vendor Metrics

```typescript
{
  total: number;
  recent: Vendor[];
  statusDistribution: {
    notStarted: number;
    inReview: number;
    reviewed: number;
    requiresFollowUp: number;
  }
}
```

### Policy Metrics

```typescript
{
  total: number;
  pendingReview: number;
  statusDistribution: {
    draft: number;
    underReview: number;
    approved: number;
    published: number;
    archived: number;
    deprecated: number;
  }
}
```

### Incident Metrics

```typescript
{
  total: number;
  open: number;
  statusDistribution: {
    open: number;
    investigating: number;
    mitigated: number;
    closed: number;
  }
}
```

### Model Lifecycle Metrics

```typescript
{
  pending: number;
  approved: number;
  restricted: number;
  blocked: number;
}
```

### Training Metrics

```typescript
{
  planned: number;
  inProgress: number;
  completed: number;
  completionPercentage: number;
  totalPeople: number;
}
```

### Evidence Hub Metrics

```typescript
{
  totalEvidence: number;
  totalFiles: number;
  modelsWithEvidence: number;
  coveragePercentage: number;
}
```

## Risk History Time-Series

### Tracked Parameters

| Parameter | Values |
|-----------|--------|
| `severity` | Negligible, Minor, Moderate, Major, Catastrophic |
| `likelihood` | Rare, Unlikely, Possible, Likely, Almost Certain |
| `mitigation_status` | Not Started, In Progress, Completed, On Hold, Deferred, Canceled, Requires review |
| `risk_level` | No risk, Very low, Low, Medium, High, Very high |

### Timeframes

| Timeframe | Interval |
|-----------|----------|
| `7days` | Daily |
| `15days` | Daily |
| `1month` | Daily |
| `3months` | Weekly |
| `6months` | Weekly |
| `1year` | Monthly |

### Time-Series Response

```json
{
  "parameter": "severity",
  "data": [
    {
      "timestamp": "2025-01-10T00:00:00Z",
      "data": {
        "Negligible": 5,
        "Minor": 3,
        "Moderate": 8,
        "Major": 2,
        "Catastrophic": 1
      }
    }
  ],
  "count": 7
}
```

### Snapshot Logic

Snapshots are recorded when risk data changes:

```typescript
function shouldRecordSnapshot(current, previous): boolean {
  // Compare parameter counts
  // Record only if differences detected
}
```

## Frontend Architecture

### Dashboard Pages

| Page | Path | Scope |
|------|------|-------|
| DashboardOverview | `/dashboard` | Main entry point |
| Framework Dashboard | `/framework/dashboard` | Organization-wide |
| Policy Dashboard | `/policy-dashboard` | Policy metrics |
| Evals Dashboard | `/evals-dashboard` | LLM evaluation |

## Custom Hooks

### useDashboard

```typescript
const { dashboard, loading, fetchDashboard } = useDashboard();
```

### useDashboardMetrics

```typescript
const {
  riskMetrics,
  vendorMetrics,
  policyMetrics,
  incidentMetrics,
  modelRiskMetrics,
  trainingMetrics,
  evidenceMetrics,
  usersMetrics,
  taskMetrics,
  useCaseMetrics,
  evidenceHubMetrics,
  modelLifecycleMetrics,
  organizationalFrameworks,
  isLoading,
  error,
  refetch
} = useDashboardMetrics();
```

Cache configuration:
- Fresh TTL: 30 seconds
- Stale TTL: 5 minutes

## Chart Components

### RiskHistoryChart

Line chart for time-series visualization:

```typescript
<RiskHistoryChart
  parameter="severity"
  timeframe="1month"
/>
```

Features:
- Timeframe selector (7d, 15d, 1m, 3m, 6m, 1y)
- Multi-series support
- localStorage persistence
- Color-coded lines

### StatusDonutChart

Pie/donut chart for distributions:

```typescript
<StatusDonutChart
  data={[
    { label: 'High', value: 10, color: '#EF4444' },
    { label: 'Medium', value: 25, color: '#F59E0B' }
  ]}
  total={35}
/>
```

Features:
- Center total display
- Zero filtering
- Tooltip support
- Empty state handling

## Color Schemes

### Severity Colors

| Level | Color |
|-------|-------|
| Negligible | #10B981 (green) |
| Minor | #84CC16 (light green) |
| Moderate | #F59E0B (amber) |
| Major | #F97316 (orange) |
| Catastrophic | #DC2626 (red) |

### Risk Level Colors

| Level | Color |
|-------|-------|
| No risk | #10B981 |
| Very low | #84CC16 |
| Low | #FCD34D (yellow) |
| Medium | #F59E0B |
| High | #F97316 |
| Very high | #DC2626 |

### Mitigation Status Colors

| Status | Color |
|--------|-------|
| Not Started | #94A3B8 (gray) |
| In Progress | #3B82F6 (blue) |
| Completed | #10B981 (green) |
| On Hold | #F59E0B (amber) |
| Deferred | #8B5CF6 (purple) |
| Canceled | #EF4444 (red) |
| Requires review | #F97316 (orange) |

## Data Aggregation

### Count-Based

```sql
SELECT COUNT(*) FROM "{tenant}".models
```

### Distribution

```sql
SELECT severity, COUNT(*)
FROM "{tenant}".risks
GROUP BY severity
```

### Coverage Metrics

```typescript
const modelsWithEvidence = new Set();
evidence.forEach(e => {
  e.mapped_model_ids?.forEach(id => modelsWithEvidence.add(id));
});
coverage = (modelsWithEvidence.size / totalModels) * 100;
```

## Organization vs Project Scope

### Project-Specific

- Basic dashboard metrics
- Risk management analytics
- Project framework progress

### Organization-Wide

- Framework Dashboard (NIST AI RMF, ISO 27001, ISO 42001)
- Aggregated metrics across all projects
- Use case metrics (excludes organizational projects)

## Caching Strategy

### Frontend Cache

```typescript
const CACHE_CONFIG = {
  freshTTL: 30 * 1000,   // 30 seconds
  staleTTL: 5 * 60 * 1000 // 5 minutes
};
```

Pattern: Stale-while-revalidate
- Show cached data immediately
- Refresh in background
- Update UI when fresh data arrives

### Storage Keys

```
verifywise_dashboard_metrics_cache   # metrics cache
dashboard_view_preference            # "executive" | "operations"
dashboard_active_tabs                # enabled dashboard tabs (tab bar currently hidden behind SHOW_AI_AGENT_DASHBOARD_TABS)
dashboard_selected_tab               # last selected dashboard tab
```

## Error Handling

### Error Boundary

```typescript
// IntegratedDashboard.tsx wraps the whole dashboard
<DashboardErrorBoundary>
  {/* dashboard content */}
</DashboardErrorBoundary>
```

Features:
- Catches render errors
- User-friendly error message
- Retry/reload buttons
- Dev mode error details

### Resilient Fetching

```typescript
// Parallel fetch with graceful degradation
const results = await Promise.allSettled([
  fetchRisks(),
  fetchVendors(),
  fetchPolicies()
]);

// Individual failures don't block others
```

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `routes/dashboard.route.ts` | Dashboard routes |
| `controllers/dashboard.ctrl.ts` | Dashboard handler |
| `utils/dashboard.utils.ts` | Aggregation queries |
| `routes/riskHistory.route.ts` | Risk history routes |
| `controllers/riskHistory.ctrl.ts` | Time-series handler |
| `utils/history/riskHistory.utils.ts` | Snapshot utilities |

### Frontend

| File | Purpose |
|------|---------|
| `pages/DashboardOverview/` | Main dashboard |
| `pages/Framework/Dashboard/` | Framework analytics |
| `hooks/useDashboard.ts` | Dashboard data hook |
| `hooks/useDashboardMetrics.ts` | Metrics aggregation |
| `components/Charts/RiskHistoryChart.tsx` | Line chart |
| `components/Charts/StatusDonutChart.tsx` | Donut chart |
| `components/Dashboard/DashboardErrorBoundary.tsx` | Error handling |

## Related Documentation

- [Risk Management](./risk-management.md) - Risk metrics source
- [Compliance Frameworks](./compliance-frameworks.md) - Framework progress
- [Model Inventory](./models.md) - Model metrics
- [Policies](./policies.md) - Policy metrics
