# Change History Tracking

## Overview

All major entities track changes automatically using a generic change history system.

## Supported Entities

- `vendor` - Vendors
- `vendor_risk` - Vendor risks
- `project_risk` - Use case/project risks
- `policy` - Policies
- `incident` - Incidents
- `use_case` - Use cases/projects
- `model_inventory` - Model inventory
- `file` - Files
- `dataset` - Datasets

## Recording Changes

```typescript
import {
  recordEntityCreation,
  trackEntityChanges,
  recordMultipleFieldChanges,
  recordEntityDeletion,
} from "../utils/changeHistory.base.utils";

// On entity creation
await recordEntityCreation(
  "vendor",           // Entity type
  vendorId,           // Entity ID
  userId,             // User making change
  tenantId,           // Tenant
  vendorData,         // Initial data
  transaction         // Optional transaction
);

// On entity update - track changes automatically
const changes = await trackEntityChanges("vendor", oldData, newData);
if (changes.length > 0) {
  await recordMultipleFieldChanges(
    "vendor",
    vendorId,
    userId,
    tenantId,
    changes,
    transaction
  );
}

// On entity deletion
await recordEntityDeletion("vendor", vendorId, userId, tenantId, transaction);
```

## Getting Change History

```typescript
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";

const { data, hasMore, total } = await getEntityChangeHistory(
  "vendor",     // Entity type
  vendorId,     // Entity ID
  tenantId,     // Tenant
  100,          // Limit
  0             // Offset
);
```

## Adding Change History to New Entity

1. Create change history table in migration
2. Add config in `Servers/config/changeHistory.config.ts`
3. Use base utils in your controller/service
