# API Conventions

This guide documents the REST API conventions and patterns used throughout VerifyWise.

## Base URL

All API endpoints are prefixed with `/api/`:
```
https://api.verifywise.ai/api/
```

## Authentication

### JWT Authentication

All protected endpoints require a valid JWT token:

```http
Authorization: Bearer <access_token>
```

### Token Refresh

When access token expires, use the refresh token:

```http
POST /api/auth/refresh
{
  "refreshToken": "<refresh_token>"
}
```

### Response

```json
{
  "accessToken": "<new_access_token>",
  "refreshToken": "<new_refresh_token>"
}
```

## HTTP Methods

| Method | Usage | Idempotent |
|--------|-------|------------|
| GET | Retrieve resources | Yes |
| POST | Create new resources | No |
| PATCH | Partial update | Yes |
| PUT | Full update/replace | Yes |
| DELETE | Remove resources | Yes |

## URL Patterns

### Resource Naming

- Use plural nouns: `/users`, `/projects`, `/risks`
- Use lowercase with hyphens: `/vendor-risks`, `/file-manager`
- Nested resources for relationships: `/projects/:id/risks`

### Common Patterns

```
GET    /resources              - List all
GET    /resources/:id          - Get by ID
POST   /resources              - Create
PATCH  /resources/:id          - Update
DELETE /resources/:id          - Delete

# Filtered lists
GET    /resources/by-project/:projectId
GET    /resources/by-status/:status

# Actions
POST   /resources/:id/archive
POST   /resources/:id/approve
```

## Request Format

### Headers

```http
Content-Type: application/json
Authorization: Bearer <token>
```

### Query Parameters

**Pagination:**
```
?page=1&pageSize=20
?limit=50&offset=0
```

**Filtering:**
```
?status=Active&type=Risk
?filter=active|deleted|all
```

**Sorting:**
```
?sort=created_at&order=desc
```

### Request Body

```json
{
  "field_name": "value",
  "nested_object": {
    "property": "value"
  },
  "array_field": [1, 2, 3]
}
```

## Response Format

### Success Response

```json
{
  "id": 1,
  "field_name": "value",
  "created_at": "2025-01-17T10:00:00Z",
  "updated_at": "2025-01-17T10:00:00Z"
}
```

### List Response

```json
[
  { "id": 1, "name": "Item 1" },
  { "id": 2, "name": "Item 2" }
]
```

### Paginated Response

```json
{
  "data": [
    { "id": 1, "name": "Item 1" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response

```json
{
  "message": "Human-readable error message",
  "error": "ERROR_CODE",
  "details": {
    "field": "Specific validation error"
  }
}
```

## HTTP Status Codes

### Success Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH |
| 201 | Created | Successful POST |
| 202 | Accepted | Successful update/delete |
| 204 | No Content | Empty result set |

### Error Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate/conflict |
| 422 | Unprocessable | Validation failed |
| 429 | Too Many Requests | Rate limited |
| 500 | Internal Error | Server error |
| 503 | Service Unavailable | Database/service down |

## Error Handling

### Standard Error Format

```typescript
// Controller error handling pattern
export const getResource = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!Number.isSafeInteger(Number(id))) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const resource = await getResourceByIdQuery(Number(id), req.tenantId);

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    return res.status(200).json(resource.toSafeJSON());
  } catch (error) {
    console.error("Error fetching resource:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
```

### Validation Errors

```json
{
  "message": "Validation failed",
  "errors": {
    "name": "Name is required",
    "email": "Invalid email format"
  }
}
```

## Pagination

### Query Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `page` | Page number (1-indexed) | 1 |
| `pageSize` | Items per page | 20 |
| `limit` | Max items to return | 100 |
| `offset` | Items to skip | 0 |

### Response Headers

```http
X-Total-Count: 100
X-Page: 1
X-Page-Size: 20
```

## Filtering

### Single Value

```
GET /risks?status=Open
GET /vendors?review_status=Reviewed
```

### Multiple Values

```
GET /risks?status=Open,In Progress
GET /incidents?severity=Serious,Very serious
```

### Range Filters

```
GET /risks?created_after=2025-01-01
GET /incidents?occurred_before=2025-01-17
```

## Field Selection

```
GET /projects?fields=id,title,status
```

## Sorting

```
GET /risks?sort=created_at&order=desc
GET /vendors?sort=vendor_name&order=asc
```

## Multi-tenancy

### Organization Isolation

Organization context is determined from JWT token (`req.organizationId`), not request headers.

All data queries include organization_id:
```sql
SELECT * FROM risks WHERE organization_id = :organizationId AND ...
```

## Rate Limiting

### Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642089600
```

### Limits

| Endpoint Type | Limit |
|---------------|-------|
| Standard | 100/minute |
| File Operations | 20/minute |
| Report Generation | 10/minute |

### Rate Limit Response

```json
{
  "message": "Too many requests",
  "retryAfter": 60
}
```

## File Upload

### Multipart Form Data

```http
POST /file-manager
Content-Type: multipart/form-data

file: <binary>
model_id: 123 (optional)
source: "File Manager" (optional)
```

### Response

```json
{
  "id": 456,
  "filename": "document.pdf",
  "size": 245000,
  "type": "application/pdf",
  "uploaded_time": "2025-01-17T10:00:00Z"
}
```

### File Download

```http
GET /file-manager/456

Response Headers:
Content-Type: application/pdf
Content-Disposition: attachment; filename="document.pdf"
X-Content-Type-Options: nosniff
```

## Transactions

Write operations use database transactions:

```typescript
const transaction = await sequelize.transaction();
try {
  await createResourceQuery(data, tenant, transaction);
  await updateRelatedQuery(relatedId, tenant, transaction);
  await transaction.commit();
  return res.status(201).json(result);
} catch (error) {
  await transaction.rollback();
  return res.status(500).json({ message: "Internal server error" });
}
```

## Soft Delete

Many resources support soft delete:

```typescript
// Mark as deleted
PATCH /resources/:id/archive

// Query options
GET /resources?filter=active   // Default
GET /resources?filter=deleted  // Only deleted
GET /resources?filter=all      // Both
```

## API Versioning

Currently, v2 is used for newer endpoints:

```
POST /reporting/v2/generate-report
```

Legacy endpoints redirect to v2 where applicable.

## Date/Time Format

All dates use ISO 8601 format:
```
2025-01-17T10:30:00Z
2025-01-17T10:30:00+00:00
```

## Boolean Values

Accept both string and boolean:
```json
{
  "is_active": true,
  "is_active": "true"
}
```

## Null Handling

Omit null fields or explicitly set:
```json
{
  "optional_field": null
}
```

## Array Fields

PostgreSQL array format:
```json
{
  "tags": ["tag1", "tag2"],
  "ids": [1, 2, 3]
}
```

## JSONB Fields

Complex nested data:
```json
{
  "evidence_files": [
    {
      "id": 1,
      "filename": "doc.pdf",
      "size": 1000
    }
  ]
}
```

## Enum Values

Use exact string values:
```json
{
  "status": "In Progress",
  "severity": "Very serious"
}
```

Check domain documentation for valid enum values.

## Change History

Many endpoints automatically track changes:
```
GET /resource-change-history/:id
```

Response includes:
- `action`: created/updated/deleted
- `field_name`: What changed
- `old_value`: Previous value
- `new_value`: New value
- `changed_by_user_id`: Who made change
- `changed_at`: When

## Related Documentation

- [API Endpoints](../api/endpoints.md)
- [Authentication](../architecture/authentication.md)
- [Adding New Feature](./adding-new-feature.md)
