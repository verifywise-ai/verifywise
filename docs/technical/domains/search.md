# Search Domain

## Overview

The Search domain provides global search capabilities across all VerifyWise entities. It uses PostgreSQL ILIKE for case-insensitive full-text search with permission-based filtering and multi-tenant isolation.

## Key Features

- Case-insensitive search using PostgreSQL ILIKE
- 14 searchable entity types
- Permission-based result filtering
- Multi-tenant isolation
- Debounced search with request cancellation
- Recent searches persistence
- Grouped results by entity type

## API Endpoint

```
GET /api/search?q={query}&limit={limit}&offset={offset}
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | required | Search query (min 3 chars) |
| `limit` | number | 20 | Max results per entity (max 100) |
| `offset` | number | 0 | Pagination offset |

### Response Structure

```typescript
{
  results: {
    [entityType: string]: {
      results: SearchResult[];
      count: number;
      icon: string;
    }
  };
  totalCount: number;
  query: string;
  message?: string;
}
```

### Search Result

```typescript
interface SearchResult {
  id: number | string;
  entityType: string;
  title: string;
  subtitle?: string;
  matchedField: string;
  matchedValue: string;
  route: string;
  icon?: string;
}
```

## Searchable Entities

| Entity | Table | Search Columns | Route |
|--------|-------|----------------|-------|
| projects | projects | project_title, goal, description | `/overview?projectId={id}` |
| tasks | tasks | title, description | `/tasks?taskId={id}` |
| vendors | vendors | vendor_name, vendor_provides, website | `/vendors?vendorId={id}` |
| vendor_risks | vendor_risks | risk_description, impact_description | `/vendors?tab=risks&riskId={id}` |
| model_inventories | model_inventories | provider, model, version | `/model-inventory?modelId={id}` |
| evidence_hub | evidence_hub | evidence_name, evidence_type | `/model-inventory/evidence-hub?evidenceId={id}` |
| project_risks | risks | risk_name, risk_description | `/risk-management?riskId={id}` |
| file_manager | files | filename | `/file-manager?fileId={id}` |
| policy_manager | policy_manager | title, content_html | `/policies?policyId={id}` |
| training_registar | trainingregistar | training_name, provider | `/training?trainingId={id}` |
| incident_management | ai_incident_managements | ai_project, reporter, description | `/ai-incident-managements?incidentId={id}` |
| deepeval_projects | deepeval_projects | name, description | `/evals/{id}` |
| ai_trust_center_resources | ai_trust_center_resources | name, description | `/ai-trust-center/resources?resourceId={id}` |
| ai_trust_center_subprocessors | ai_trust_center_subprocessor | name, purpose | `/ai-trust-center/subprocessors?subprocessorId={id}` |

## Permission Filtering

### Project-Based Access

```sql
-- Users see only projects they're members of
WHERE id IN (
  SELECT project_id FROM projects_members
  WHERE member_id = :userId
)
```

Applies to: `projects`, `project_risks`, `tasks`

### Vendor Access

```sql
-- Users see vendors through their projects
WHERE id IN (
  SELECT vendor_id FROM vendors_projects
  WHERE project_id IN (user_accessible_project_ids)
)
```

Applies to: `vendors`, `vendor_risks`

### Organization Filtering

Some entities filtered by `organization_id`:
- tasks
- file_manager

## Query Implementation

```sql
SELECT DISTINCT * FROM {tableName}
WHERE organization_id = :organizationId
AND (
  column1::text ILIKE :pattern
  OR column2::text ILIKE :pattern
  OR ...
)
AND [permission_filters]
LIMIT :limit
```

### Pattern Escaping

Special ILIKE characters are escaped:
- `%` → `\%`
- `_` → `\_`
- `\` → `\\`

## Frontend Implementation

### Custom Hook

```typescript
const {
  query,
  setQuery,
  results,
  flatResults,
  isLoading,
  error,
  totalCount,
  recentSearches,
  clearRecentSearches,
  isSearchMode,
} = useWiseSearch();
```

### Features

- **Debouncing**: 300ms delay before API call
- **Request Cancellation**: Aborts previous request on new search
- **Recent Searches**: Stored in localStorage (last 5, max 7 days)
- **Minimum Query**: 3 characters required

### Command Palette

Global search UI using `cmdk` library:
- Keyboard shortcut: `Cmd/Ctrl + K`
- Results grouped by entity type
- Keyboard navigation support
- Entity-specific icons

## Security

### SQL Injection Prevention

- Table name whitelisting (only 14 allowed tables)
- Parameterized queries with Sequelize
- ILIKE special characters escaped

### Multi-Tenant Isolation

- All queries include `WHERE organization_id = :organizationId`
- Organization ID comes from JWT middleware (`req.organizationId`)

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `controllers/search.ctrl.ts` | Endpoint handler |
| `routes/search.route.ts` | Route definition |
| `utils/search.utils.ts` | Query building, entity config |

### Frontend

| File | Purpose |
|------|---------|
| `infrastructure/api/searchService.ts` | API integration |
| `application/hooks/useWiseSearch.ts` | Search hook |
| `components/CommandPalette/index.tsx` | Global search UI |
| `components/Search/SearchBox/index.tsx` | Search input |

## Related Documentation

- [API Endpoints](../api/endpoints.md)
- [Frontend Overview](../frontend/overview.md)
