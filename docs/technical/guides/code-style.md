# Code Style Guide

This guide documents the TypeScript/JavaScript conventions and coding standards used throughout VerifyWise.

## TypeScript Configuration

### Strict Mode

Both frontend and backend use strict TypeScript settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Target & Module System

| Project | Target | Module |
|---------|--------|--------|
| Frontend (Clients) | ES2020 | ESNext |
| Backend (Servers) | ES6 | CommonJS |

### Backend-Specific Settings

```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
}
```

Required for Sequelize-TypeScript decorators.

## Naming Conventions

### Files

| Type | Convention | Example |
|------|------------|---------|
| Controllers | `entityName.ctrl.ts` | `assessment.ctrl.ts` |
| Routes | `entityName.route.ts` | `project.route.ts` |
| Utils | `entityName.utils.ts` | `risk.utils.ts` |
| Models | `entityName.model.ts` | `task.model.ts` |
| Enums | `entity-name.enum.ts` | `task-status.enum.ts` |
| Interfaces | `i.entityName.ts` | `i.task.ts` |
| React Components | `index.tsx` in folder | `Button/index.tsx` |
| Hooks | `useCamelCase.ts` | `useAuth.ts` |
| Repositories | `entityName.repository.ts` | `task.repository.ts` |
| Types | `entityName.types.ts` | `task.types.ts` |

### Variables & Functions

```typescript
// camelCase for variables and functions
const userName = "John";
function getUserById(id: number) { ... }

// PascalCase for classes and components
class UserService { ... }
const UserProfile: React.FC = () => { ... };

// UPPER_SNAKE_CASE for constants
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = "/api";

// Enum members use PascalCase
enum TaskStatus {
  NotStarted = "Not started",
  InProgress = "In progress",
  Completed = "Completed"
}
```

### Interfaces & Types

```typescript
// Prefix interfaces with 'I'
interface ITask {
  id: number;
  title: string;
}

// Safe JSON variants for API responses
interface ITaskSafeJSON {
  id: number;
  title: string;
  created_at: string; // Date as ISO string
}

// Extended interfaces for computed properties
interface ITaskJSON extends ITaskSafeJSON {
  isOverdue: boolean;
  assignee_names: string[];
}
```

### Database Columns

Use snake_case for database columns:

```typescript
interface ITask {
  id: number;
  task_title: string;      // snake_case
  created_at: Date;
  updated_at: Date;
  organization_id: number;
}
```

## Import Organization

Organize imports in this order:

```typescript
// 1. External dependencies
import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

// 2. Type imports
import type { ITask } from "../domain.layer/interfaces/i.task";

// 3. Internal utilities and services
import { STATUS_CODE } from "../utils/statusCode.utils";
import { getTaskByIdQuery } from "../utils/task.utils";

// 4. Models and exceptions
import { TaskModel } from "../domain.layer/models/tasks/tasks.model";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

// 5. Constants and config
import { TASK_VALIDATION_LIMITS } from "../constants/validation";
```

### Frontend Import Order

```typescript
// 1. React and external libraries
import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { Box, Typography } from "@mui/material";

// 2. Type imports
import type { RootState } from "../redux/store";

// 3. Hooks and contexts
import { useAuth } from "../hooks/useAuth";
import { useVerifyWiseContext } from "../contexts/VerifyWise.context";

// 4. Components
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";

// 5. Utils and helpers
import { formatDate } from "../utils/dateUtils";

// 6. Styles and assets
import { containerStyle } from "./styles";
```

## Comments & Documentation

### JSDoc for Public APIs

```typescript
/**
 * Retrieves a task by its ID with full details.
 *
 * @param id - The unique task identifier
 * @param organizationId - The organization ID for data isolation
 * @returns The task with assignees and creator info, or null if not found
 * @throws {ValidationException} If ID is invalid
 *
 * @example
 * const task = await getTaskByIdQuery(123, organizationId);
 */
export async function getTaskByIdQuery(
  id: number,
  tenant: string
): Promise<ITaskJSON | null> {
  // Implementation
}
```

### File Headers

```typescript
/**
 * @fileoverview Task management controller handling CRUD operations.
 *
 * This controller provides endpoints for creating, reading, updating,
 * and deleting tasks within the multi-tenant architecture.
 *
 * @module controllers/task
 */
```

### Inline Comments

Use sparingly, only for complex logic:

```typescript
// Calculate risk level based on severity and likelihood matrix
const riskLevel = calculateRiskMatrix(severity, likelihood);

// Skip validation for admin users who can override restrictions
if (userRole === "Admin") {
  return true;
}
```

### TODO Comments

```typescript
// TODO: Implement pagination for large result sets
// TODO(username): Refactor this to use the new validation service
// FIXME: Handle edge case when date is null
```

## Type Annotations

### Always Annotate Function Returns

```typescript
// Good
function getUserName(user: IUser): string {
  return user.name;
}

// Good - async functions
async function getTaskById(id: number): Promise<ITask | null> {
  return await taskRepository.findById(id);
}

// Avoid - implicit return type
function getUserName(user: IUser) {
  return user.name;
}
```

### Use Explicit Types for Complex Objects

```typescript
// Good
const config: DatabaseConfig = {
  host: "localhost",
  port: 5432,
  database: "verifywise"
};

// Avoid - relies on inference for complex objects
const config = {
  host: "localhost",
  port: 5432,
  database: "verifywise"
};
```

### Prefer Interfaces Over Type Aliases

```typescript
// Prefer for object shapes
interface IUser {
  id: number;
  name: string;
}

// Use type for unions, intersections, primitives
type UserId = number | string;
type UserWithRole = IUser & { role: string };
```

## Enums

### String Enums for Database Values

```typescript
// Good - explicit string values match database
export enum TaskStatus {
  OPEN = "Open",
  IN_PROGRESS = "In Progress",
  COMPLETED = "Completed",
  DELETED = "Deleted"
}

// Usage
task.status = TaskStatus.IN_PROGRESS;
```

### Enum Files

Place enums in dedicated files:

```
domain.layer/enums/
├── task-status.enum.ts
├── task-priority.enum.ts
├── approval-workflow.enum.ts
└── index.ts  // Re-exports all enums
```

## Error Handling

### Use Custom Exceptions

```typescript
// Define specific exception types
throw new ValidationException("Title is required", "title");
throw new NotFoundException("Task not found", id);
throw new AuthorizationException("Insufficient permissions");

// Catch and handle appropriately
try {
  await updateTask(data);
} catch (error) {
  if (error instanceof ValidationException) {
    return res.status(400).json({ message: error.message });
  }
  throw error; // Re-throw unexpected errors
}
```

### Never Swallow Errors

```typescript
// Bad - silently fails
try {
  await riskyOperation();
} catch (error) {
  // Empty catch
}

// Good - at minimum, log the error
try {
  await riskyOperation();
} catch (error) {
  console.error("Operation failed:", error);
  // Handle or re-throw
}
```

## Null & Undefined

### Use Nullish Coalescing

```typescript
// Good
const name = user.name ?? "Unknown";
const count = response.count ?? 0;

// Avoid - doesn't handle empty string or 0 correctly
const name = user.name || "Unknown";
```

### Optional Chaining

```typescript
// Good
const city = user?.address?.city;
const firstItem = items?.[0];
const result = callback?.();

// Avoid - verbose null checks
const city = user && user.address && user.address.city;
```

### Explicit Null Checks for Important Logic

```typescript
// When null vs undefined matters
if (value === null) {
  // Explicitly set to null
}

if (value === undefined) {
  // Not provided
}

// When either is acceptable
if (value == null) {
  // null or undefined
}
```

## Async/Await

### Always Use Async/Await Over Promises

```typescript
// Good
async function fetchUser(id: number): Promise<IUser> {
  const user = await userRepository.findById(id);
  const profile = await profileRepository.findByUserId(id);
  return { ...user, profile };
}

// Avoid - promise chains
function fetchUser(id: number): Promise<IUser> {
  return userRepository.findById(id)
    .then(user => profileRepository.findByUserId(id)
      .then(profile => ({ ...user, profile })));
}
```

### Parallel Execution

```typescript
// Good - parallel when independent
const [user, settings, notifications] = await Promise.all([
  fetchUser(userId),
  fetchSettings(userId),
  fetchNotifications(userId)
]);

// Sequential when dependent
const user = await fetchUser(userId);
const projects = await fetchProjectsForUser(user.organizationId);
```

## ESLint Rules

The project uses ESLint 9 with TypeScript support:

```javascript
// Key rules enforced
{
  rules: {
    // React hooks rules
    ...reactHooks.configs.recommended.rules,

    // Only export components from component files
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true }
    ]
  }
}
```

## Code Formatting

### Indentation

- Use 2 spaces for indentation
- No tabs

### Line Length

- Aim for 100 characters max
- Break long lines logically

### Trailing Commas

```typescript
// Use trailing commas in multiline
const config = {
  host: "localhost",
  port: 5432,
  database: "verifywise",  // Trailing comma
};

const items = [
  "item1",
  "item2",
  "item3",  // Trailing comma
];
```

### Semicolons

- Always use semicolons

### Quotes

- Use double quotes for strings
- Use backticks for template literals

```typescript
const name = "John";
const greeting = `Hello, ${name}!`;
```

## Related Documentation

- [Backend Patterns](./backend-patterns.md)
- [Frontend Patterns](./frontend-patterns.md)
- [API Conventions](./api-conventions.md)
