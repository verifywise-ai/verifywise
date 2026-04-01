# Logging System

## Log Helper Usage

```typescript
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";

export async function myFunction(req: Request, res: Response) {
  // Log start of operation
  logProcessing({
    description: "Starting myFunction",
    functionName: "myFunction",
    fileName: "myController.ctrl.ts",
    userId: req.userId!,
    tenantId: req.tenantId!,
  });

  try {
    // ... operation logic

    // Log success (also writes to event_logs table for non-Read operations)
    await logSuccess({
      eventType: "Create",  // "Create" | "Read" | "Update" | "Delete"
      description: "Created new entity",
      functionName: "myFunction",
      fileName: "myController.ctrl.ts",
      userId: req.userId!,
      tenantId: req.tenantId!,
    });

    return res.status(200).json(result);
  } catch (error) {
    // Log failure
    await logFailure({
      eventType: "Create",
      description: "Failed to create entity",
      functionName: "myFunction",
      fileName: "myController.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.tenantId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

## Log Levels

| Level | Usage |
|-------|-------|
| `debug` | Detailed debugging (dev only) |
| `info` | General operational info |
| `warn` | Warnings (not errors) |
| `error` | Errors that need attention |

## Log Files

Logs are written to tenant-specific directories:
```
Servers/logs/
├── default/
│   └── app-2026-02-20.log
├── a1b2c3d4e5/  # Tenant-specific
│   └── app-2026-02-20.log
└── x9y8z7w6v5/
    └── app-2026-02-20.log
```

## Direct Logger Usage

```typescript
import logger from "../utils/logger/fileLogger";

logger.debug("Detailed debug info");
logger.info("General info");
logger.warn("Warning message");
logger.error("Error occurred", error);
```
