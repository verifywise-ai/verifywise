# Share Links System

## Overview

The Share Links domain provides secure, tokenized public sharing of VerifyWise resources without requiring authentication. It supports sharing individual records or entire table views with configurable permissions and optional expiration.

## Key Features

- Cryptographic token generation (64-char hex)
- Public access without authentication
- Configurable field visibility
- Optional expiration dates
- Enable/disable without deletion
- Data export permissions
- Multi-tenant token resolution

## Database Schema

### Share Links Table

```
{tenant}.share_links
├── id (PK, SERIAL)
├── share_token (VARCHAR(64) UNIQUE NOT NULL)
├── resource_type (VARCHAR(50) NOT NULL)
├── resource_id (INTEGER NOT NULL)
├── created_by (INTEGER NOT NULL, FK → users)
├── settings (JSONB)
├── is_enabled (BOOLEAN, default: true)
├── expires_at (TIMESTAMPTZ)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### Indexes

```sql
CREATE INDEX share_links_token_idx ON share_links(share_token);
CREATE INDEX share_links_resource_idx ON share_links(resource_type, resource_id);
CREATE INDEX share_links_created_by_idx ON share_links(created_by);
```

### Default Settings

```json
{
  "shareAllFields": false,
  "allowDataExport": true,
  "allowViewersToOpenRecords": false,
  "displayToolbar": true
}
```

## Supported Resource Types

| Resource Type | Table | Description |
|---------------|-------|-------------|
| `model` | model_inventories | AI/ML model inventory |
| `vendor` | vendors | Vendor records |
| `project` | projects | Project records |
| `policy` | policies | Policy documents |
| `risk` | projectrisks | Risk records |

## API Endpoints

### Public Endpoints (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shares/token/:token` | Get link metadata |
| GET | `/shares/view/:token` | Get shared data |

### Authenticated Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/shares` | Create share link |
| GET | `/shares/:resourceType/:resourceId` | Get links for resource |
| PATCH | `/shares/:id` | Update link settings |
| DELETE | `/shares/:id` | Revoke share link |

### Create Share Link Request

```json
{
  "resource_type": "model",
  "resource_id": 0,
  "settings": {
    "shareAllFields": false,
    "allowDataExport": true
  },
  "expires_at": "2025-02-17T12:00:00Z"
}
```

### Share Link Response

```json
{
  "data": {
    "id": 42,
    "share_token": "abc123def456789...",
    "resource_type": "model",
    "resource_id": 0,
    "settings": {
      "shareAllFields": false,
      "allowDataExport": true
    },
    "is_enabled": true,
    "expires_at": null,
    "shareable_url": "https://app.verifywise.ai/shared/models/abc123def456789..."
  }
}
```

### Shared Data Response

```json
{
  "data": {
    "share_link": {
      "resource_type": "model",
      "settings": { "shareAllFields": false, "allowDataExport": true }
    },
    "data": [
      {
        "id": 1,
        "model_name": "OpenAI - gpt-4",
        "version": "1.0",
        "status": "Approved"
      }
    ],
    "permissions": {
      "allowDataExport": true,
      "allowViewersToOpenRecords": false
    }
  }
}
```

## Token Generation

Tokens are generated using Node.js crypto:

```typescript
import crypto from 'crypto';

function generateShareToken(): string {
  return crypto.randomBytes(32).toString('hex');
  // Returns 64-character hexadecimal string
}
```

### Token Validation

```typescript
function isValidShareToken(token: string): boolean {
  // Must be exactly 64 hexadecimal characters
  return /^[a-f0-9]{64}$/.test(token);
}
```

## Resource ID Semantics

| resource_id | Behavior |
|-------------|----------|
| `0` | Share entire table view (max 100 records) |
| `> 0` | Share specific record by ID |

## Field Filtering

### When `shareAllFields = false`

**Model Resources:**
```typescript
{
  id: number;
  model_name: string;  // Consolidated from provider_model
  version: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}
```

**Other Resources:**
```typescript
{
  id: number;
  name: string;
  description: string;
  created_at: Date;
  updated_at: Date;
}
```

### When `shareAllFields = true`

All database fields are returned as-is.

## Public Access Flow

```
External User
    ↓
Accesses: /shared/models/abc123...
    ↓
Frontend loads SharedView page
    ↓
GET /api/shares/view/abc123...
    ↓
Backend looks up the token in the share_links table
    ↓
Token found? → Check is_enabled + expires_at
    ↓
Valid? → Fetch resource data from tenant
    ↓
Apply field filtering (shareAllFields)
    ↓
Return data + permissions
    ↓
Frontend renders table/detail view
```

## Validation Chain

```typescript
// 1. Token format validation
if (!isValidShareToken(token)) {
  return 400; // Invalid token format
}

// 2. Token existence check (across all tenants)
const shareLink = await findShareLinkByToken(token);
if (!shareLink) {
  return 404; // Not found
}

// 3. Enabled check
if (!shareLink.is_enabled) {
  return 403; // Forbidden - disabled
}

// 4. Expiration check
if (shareLink.expires_at && new Date() > shareLink.expires_at) {
  return 403; // Forbidden - expired
}

// 5. Fetch and return data
return fetchResourceData(shareLink);
```

## Shareable URL Format

```
https://app.verifywise.ai/shared/{resource_type}s/{share_token}

Examples:
- /shared/models/abc123def456...
- /shared/vendors/xyz789abc123...
- /shared/risks/def456ghi789...
```

## Frontend Components

### Component Structure

```
ShareViewDropdown/
├── index.tsx           # Main dropdown
├── ShareButton.tsx     # Icon button trigger
└── ManageShareLinks.tsx # Manage existing links

SharedView/
└── index.tsx           # Public view page
```

### ShareViewDropdown

Features:
- Toggle share on/off
- Copy link to clipboard
- Open in new tab
- Configure settings (shareAllFields, allowDataExport)
- Refresh/regenerate link
- Manage multiple links

### SharedView Page

Features:
- No authentication required
- Data table display
- CSV export (if allowed)
- Status badges formatting
- Date formatting
- Error handling for expired/revoked

## Settings Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `shareAllFields` | boolean | false | Show all fields or filtered subset |
| `allowDataExport` | boolean | true | Enable CSV export |
| `allowViewersToOpenRecords` | boolean | false | Allow clicking into records |
| `displayToolbar` | boolean | true | Show toolbar controls |

## React Query Integration

### Custom Hooks

```typescript
useShareLinks(resourceType, resourceId)  // Fetch links
useShareLinkByToken(token)               // Public token lookup
useCreateShareLink()                     // Create mutation
useUpdateShareLink()                     // Update mutation
useDeleteShareLink()                     // Delete mutation
```

### Cache Keys

```typescript
['shares', 'list', resourceType, resourceId]
['shares', 'detail', token]
```

## Security Considerations

### Strengths

- 64-char cryptographic tokens (infeasible to guess)
- Token validation prevents format attacks
- Expiration support
- Can disable without deletion
- Ownership verification on mutations
- Field filtering reduces data exposure
- SQL injection prevention

### Design Choices

- Token lookup is a single query on the shared share_links table; the organization comes from the matched row
- No rate limiting on public endpoints (consider adding)
- No audit log of public views (only mutations logged)

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `domain.layer/models/shareLink/shareLink.model.ts` | Model with token generation |
| `domain.layer/interfaces/i.shareLink.ts` | Type definitions |
| `controllers/shareLink.ctrl.ts` | API handlers |
| `routes/shareLink.route.ts` | Route definitions |
| `utils/security.utils.ts` | Validation functions |

### Frontend

| File | Purpose |
|------|---------|
| `components/ShareViewDropdown/index.tsx` | Share dropdown UI |
| `components/ShareViewDropdown/ShareButton.tsx` | Share button |
| `components/ShareViewDropdown/ManageShareLinks.tsx` | Link management |
| `pages/SharedView/index.tsx` | Public view page |
| `hooks/useShare.ts` | React Query hooks |
| `repository/share.repository.ts` | API client |

## Related Documentation

- [Model Inventory](./models.md) - Uses share links
- [Authentication](../architecture/authentication.md) - JWT for protected endpoints
- [Multi-Tenancy](../architecture/multi-tenancy.md) - Tenant schema isolation
