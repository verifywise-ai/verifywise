# Backend Patterns

This guide documents the architectural patterns, conventions, and best practices used in the VerifyWise backend (Servers).

## Project Structure

```
Servers/
├── index.ts                    # Application entry point
├── controllers/                # Request handlers
│   └── entityName.ctrl.ts
├── routes/                     # Express route definitions
│   └── entityName.route.ts
├── utils/                      # Business logic & database queries
│   └── entityName.utils.ts
├── services/                   # Complex business services
│   └── serviceName/
├── middleware/                 # Express middleware
│   ├── auth.middleware.ts
│   └── rateLimit.middleware.ts
├── domain.layer/               # Domain models & interfaces
│   ├── models/
│   ├── interfaces/
│   ├── enums/
│   └── exceptions/
├── database/                   # Database configuration
│   ├── db.ts
│   └── migrations/
├── jobs/                       # Background job processing
├── templates/                  # Email (MJML) & PDF (EJS)
└── config/                     # Configuration files
```

## Controller Pattern

Controllers handle HTTP requests and responses. They should be thin, delegating business logic to utils/services.

### Structure

```typescript
// controllers/task.ctrl.ts
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { getTaskByIdQuery, createTaskQuery } from "../utils/task.utils";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";

/**
 * Get task by ID
 */
export async function getTaskById(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Fetching task by ID",
    functionName: "getTaskById",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const { id } = req.params;

    // Validate input
    if (!Number.isSafeInteger(Number(id))) {
      throw new ValidationException("Invalid task ID", "id");
    }

    // Delegate to utils
    const task = await getTaskByIdQuery(Number(id), req.organizationId!);

    if (!task) {
      return res.status(404).json(STATUS_CODE[404]("Task not found"));
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved task ${id}`,
      functionName: "getTaskById",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](task));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to fetch task: ${(error as Error).message}`,
      functionName: "getTaskById",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

### Controller Guidelines

1. **Keep controllers thin** - Only handle request/response logic
2. **Validate input early** - Check parameters before processing
3. **Use structured logging** - Log start, success, and failure
4. **Return consistent responses** - Always use STATUS_CODE helper
5. **Handle errors appropriately** - Catch and return proper status codes

## Route Pattern

Routes define HTTP endpoints and attach middleware.

### Structure

```typescript
// routes/task.route.ts
import express from "express";
import { authenticateJWT } from "../middleware/auth.middleware";
import { checkAccess } from "../middleware/access.middleware";
import { rateLimiter } from "../middleware/rateLimit.middleware";
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from "../controllers/task.ctrl";

const router = express.Router();

// List routes - most specific first
router.get("/", authenticateJWT, getAllTasks);
router.get("/:id", authenticateJWT, getTaskById);

// Write routes - with additional middleware
router.post("/", authenticateJWT, checkAccess(["Admin", "Editor"]), createTask);
router.put("/:id", authenticateJWT, checkAccess(["Admin", "Editor"]), updateTask);
router.delete("/:id", authenticateJWT, checkAccess(["Admin"]), deleteTask);

// Rate-limited routes
router.post(
  "/bulk-import",
  authenticateJWT,
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  bulkImportTasks
);

export default router;
```

### Route Registration

```typescript
// routes/index.ts
import express from "express";
import taskRoutes from "./task.route";
import riskRoutes from "./risk.route";

const router = express.Router();

router.use("/tasks", taskRoutes);
router.use("/risks", riskRoutes);

export default router;
```

## Utils Pattern

Utils contain business logic and database queries. They are the workhorses of the backend.

### Structure

```typescript
// utils/task.utils.ts
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { TaskModel } from "../domain.layer/models/tasks/tasks.model";
import { ITask, ITaskJSON } from "../domain.layer/interfaces/i.task";

/**
 * Get all tasks for an organization with optional filters
 */
export async function getTasksQuery(
  organizationId: number,
  filters?: {
    status?: string;
    priority?: string;
    assigneeId?: number;
  }
): Promise<ITaskJSON[]> {
  const whereConditions: string[] = ["t.organization_id = :organizationId"];
  const replacements: Record<string, any> = { organizationId };

  if (filters?.status) {
    whereConditions.push("t.status = :status");
    replacements.status = filters.status;
  }

  if (filters?.priority) {
    whereConditions.push("t.priority = :priority");
    replacements.priority = filters.priority;
  }

  if (filters?.assigneeId) {
    whereConditions.push(`
      t.id IN (
        SELECT task_id FROM task_assignees
        WHERE user_id = :assigneeId
      )
    `);
    replacements.assigneeId = filters.assigneeId;
  }

  const query = `
    SELECT t.*,
           u.name as creator_name,
           COALESCE(
             json_agg(DISTINCT ta.user_id) FILTER (WHERE ta.user_id IS NOT NULL),
             '[]'
           ) as assignees
    FROM tasks t
    LEFT JOIN users u ON t.creator_id = u.id
    LEFT JOIN task_assignees ta ON t.id = ta.task_id
    WHERE ${whereConditions.join(" AND ")}
    GROUP BY t.id, u.name
    ORDER BY t.created_at DESC
  `;

  const results = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return results as ITaskJSON[];
}

/**
 * Create a new task with assignees
 */
export async function createTaskQuery(
  data: Partial<ITask>,
  organizationId: number,
  assigneeIds?: number[],
  transaction?: Transaction
): Promise<ITask> {
  const query = `
    INSERT INTO tasks
      (organization_id, title, description, creator_id, due_date, priority, status, categories)
    VALUES
      (:organizationId, :title, :description, :creatorId, :dueDate, :priority, :status, :categories)
    RETURNING *
  `;

  const [result] = await sequelize.query(query, {
    replacements: {
      organizationId,
      title: data.title,
      description: data.description || null,
      creatorId: data.creator_id,
      dueDate: data.due_date || null,
      priority: data.priority || "Medium",
      status: data.status || "Open",
      categories: JSON.stringify(data.categories || []),
    },
    type: QueryTypes.INSERT,
    transaction,
  });

  const task = (result as any[])[0] as ITask;

  // Add assignees if provided
  if (assigneeIds?.length) {
    await addTaskAssigneesQuery(task.id!, assigneeIds, organizationId, transaction);
  }

  return task;
}
```

### Utils Guidelines

1. **One entity per file** - Keep utils focused
2. **Use parameterized queries** - Prevent SQL injection
3. **Support transactions** - Accept optional transaction parameter
4. **Return typed results** - Use interfaces for return types
5. **Handle multi-tenancy** - Always include `organization_id` in queries

## Multi-Tenant Queries

All tenant-scoped queries must include `organization_id`. Use unqualified table names (resolved via `search_path = verifywise`).

### Pattern

```typescript
// Unqualified table name — no schema prefix needed
const query = `
  SELECT * FROM tasks
  WHERE organization_id = :organizationId AND id = :id
`;

// For joins with other tables (all in verifywise schema)
const query = `
  SELECT t.*, u.name as creator_name
  FROM tasks t
  LEFT JOIN users u ON t.creator_id = u.id
  WHERE t.organization_id = :organizationId AND t.id = :id
`;
```

## Error Handling

### Custom Exceptions

```typescript
// domain.layer/exceptions/custom.exception.ts
export class CustomException extends Error {
  public readonly statusCode: number;
  public readonly metadata?: Record<string, any>;

  constructor(message: string, statusCode: number, metadata?: Record<string, any>) {
    super(message);
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

export class ValidationException extends CustomException {
  constructor(message: string, field?: string, value?: any) {
    super(message, 400, { field, value });
  }
}

export class NotFoundException extends CustomException {
  constructor(resource: string, id?: number | string) {
    super(`${resource} not found`, 404, { resource, id });
  }
}

export class AuthorizationException extends CustomException {
  constructor(message: string = "Insufficient permissions") {
    super(message, 403);
  }
}

export class ConflictException extends CustomException {
  constructor(message: string, conflictingField?: string) {
    super(message, 409, { conflictingField });
  }
}
```

### Error Handling in Controllers

```typescript
try {
  // Business logic
} catch (error) {
  if (error instanceof ValidationException) {
    return res.status(400).json(STATUS_CODE[400](error.message));
  }
  if (error instanceof NotFoundException) {
    return res.status(404).json(STATUS_CODE[404](error.message));
  }
  if (error instanceof AuthorizationException) {
    return res.status(403).json(STATUS_CODE[403](error.message));
  }
  if (error instanceof ConflictException) {
    return res.status(409).json(STATUS_CODE[409](error.message));
  }

  // Log unexpected errors
  console.error("Unexpected error:", error);
  return res.status(500).json(STATUS_CODE[500]("Internal server error"));
}
```

## Response Standardization

Use the STATUS_CODE helper for consistent responses.

### Pattern

```typescript
// utils/statusCode.utils.ts
export const STATUS_CODE: Record<number, (data?: any) => ResponseFormat> = {
  200: (data) => ({ status: 200, message: "Success", data }),
  201: (data) => ({ status: 201, message: "Created", data }),
  204: () => ({ status: 204, message: "No Content" }),
  400: (message) => ({ status: 400, message: message || "Bad Request" }),
  401: (message) => ({ status: 401, message: message || "Unauthorized" }),
  403: (message) => ({ status: 403, message: message || "Forbidden" }),
  404: (message) => ({ status: 404, message: message || "Not Found" }),
  409: (message) => ({ status: 409, message: message || "Conflict" }),
  500: (message) => ({ status: 500, message: message || "Internal Server Error" }),
};

// Usage in controllers
return res.status(200).json(STATUS_CODE[200](task));
return res.status(404).json(STATUS_CODE[404]("Task not found"));
return res.status(201).json(STATUS_CODE[201](newTask));
```

## Logging Pattern

Use structured logging for traceability.

### Log Helpers

```typescript
// utils/logger/logHelper.ts
interface LogContext {
  description: string;
  functionName: string;
  fileName: string;
  userId: number;
  tenantId: string;
}

interface LogSuccessContext extends LogContext {
  eventType: "Create" | "Read" | "Update" | "Delete";
}

export function logProcessing(context: LogContext): void {
  console.log(`[PROCESSING] ${context.fileName}:${context.functionName}`, {
    description: context.description,
    userId: context.userId,
    tenantId: context.tenantId,
    timestamp: new Date().toISOString(),
  });
}

export async function logSuccess(context: LogSuccessContext): Promise<void> {
  console.log(`[SUCCESS] ${context.fileName}:${context.functionName}`, {
    eventType: context.eventType,
    description: context.description,
    userId: context.userId,
    tenantId: context.tenantId,
    timestamp: new Date().toISOString(),
  });

  // Optionally write to audit log table
  await writeAuditLog(context);
}

export async function logFailure(context: LogSuccessContext): Promise<void> {
  console.error(`[FAILURE] ${context.fileName}:${context.functionName}`, {
    eventType: context.eventType,
    description: context.description,
    userId: context.userId,
    tenantId: context.tenantId,
    timestamp: new Date().toISOString(),
  });
}
```

### Usage

```typescript
export async function createTask(req: Request, res: Response) {
  logProcessing({
    description: "Creating new task",
    functionName: "createTask",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const task = await createTaskQuery(req.body, req.organizationId!);

    await logSuccess({
      eventType: "Create",
      description: `Created task ${task.id}`,
      functionName: "createTask",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](task));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: `Failed to create task: ${(error as Error).message}`,
      functionName: "createTask",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    throw error;
  }
}
```

## Middleware Pattern

### Authentication Middleware

```typescript
// middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export async function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    // Attach user info to request
    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    req.userRole = decoded.role;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
```

### Access Control Middleware

```typescript
// middleware/access.middleware.ts
export function checkAccess(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

// Usage in routes
router.post("/", authenticateJWT, checkAccess(["Admin", "Editor"]), createTask);
```

### Rate Limiting Middleware

```typescript
// middleware/rateLimit.middleware.ts
import rateLimit from "express-rate-limit";

export const rateLimiter = (options: { windowMs: number; max: number }) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { message: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Usage
router.post(
  "/scans",
  authenticateJWT,
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  startScan
);
```

## Model Pattern (Sequelize-TypeScript)

### Structure

```typescript
// domain.layer/models/tasks/tasks.model.ts
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { ITask, ITaskSafeJSON } from "../../interfaces/i.task";
import { TaskStatus } from "../../enums/task-status.enum";
import { TaskPriority } from "../../enums/task-priority.enum";

@Table({
  tableName: "tasks",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
})
export class TaskModel extends Model<TaskModel> implements ITask {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    validate: {
      len: [1, 255],
    },
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  creator_id!: number;

  @Column({
    type: DataType.ENUM(...Object.values(TaskStatus)),
    allowNull: false,
    defaultValue: TaskStatus.OPEN,
  })
  status!: TaskStatus;

  @Column({
    type: DataType.ENUM(...Object.values(TaskPriority)),
    allowNull: false,
    defaultValue: TaskPriority.MEDIUM,
  })
  priority!: TaskPriority;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  due_date?: Date;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  categories!: string[];

  // Relationships
  @BelongsTo(() => UserModel)
  creator!: UserModel;

  @HasMany(() => TaskAssigneeModel)
  assignees!: TaskAssigneeModel[];

  // Instance methods
  isOverdue(): boolean {
    if (!this.due_date) return false;
    if (this.status === TaskStatus.COMPLETED) return false;
    return new Date() > this.due_date;
  }

  toSafeJSON(): ITaskSafeJSON {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      due_date: this.due_date?.toISOString(),
      categories: this.categories,
      created_at: this.getDataValue("created_at")?.toISOString(),
      updated_at: this.getDataValue("updated_at")?.toISOString(),
    };
  }

  // Static validation method
  static validateTaskData(data: Partial<ITask>): string[] {
    const errors: string[] = [];

    if (!data.title?.trim()) {
      errors.push("Title is required");
    } else if (data.title.length > 255) {
      errors.push("Title must be 255 characters or less");
    }

    if (data.description && data.description.length > 5000) {
      errors.push("Description must be 5000 characters or less");
    }

    if (data.categories && data.categories.length > 10) {
      errors.push("Maximum 10 categories allowed");
    }

    return errors;
  }
}
```

## Transaction Pattern

Use transactions for operations that modify multiple tables.

```typescript
export async function createTaskWithAssignees(
  taskData: Partial<ITask>,
  assigneeIds: number[],
  organizationId: number
): Promise<ITask> {
  const transaction = await sequelize.transaction();

  try {
    // Create task
    const task = await createTaskQuery(taskData, organizationId, undefined, transaction);

    // Add assignees
    for (const userId of assigneeIds) {
      await addTaskAssigneeQuery(task.id!, userId, organizationId, transaction);
    }

    // Trigger automation
    await triggerTaskAutomation("task_added", task, organizationId, transaction);

    await transaction.commit();
    return task;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

## Service Pattern

For complex business logic that spans multiple utils.

```typescript
// services/postMarketMonitoring/pmmScheduler.ts
export class PMMSchedulerService {
  private readonly organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async checkAndSendNotifications(): Promise<void> {
    const pendingCycles = await getPendingCyclesQuery(this.organizationId);

    for (const cycle of pendingCycles) {
      if (this.shouldSendReminder(cycle)) {
        await this.sendReminderNotification(cycle);
      }

      if (this.shouldEscalate(cycle)) {
        await this.sendEscalationNotification(cycle);
      }
    }
  }

  private shouldSendReminder(cycle: IPMMCycle): boolean {
    // Business logic
  }

  private async sendReminderNotification(cycle: IPMMCycle): Promise<void> {
    // Send notification
  }
}
```

## Related Documentation

- [Code Style](./code-style.md) - Naming and TypeScript conventions
- [API Conventions](./api-conventions.md) - REST patterns and responses
- [Adding New Feature](./adding-new-feature.md) - Step-by-step guide
- [Multi-Tenancy](../architecture/multi-tenancy.md) - Tenant architecture
