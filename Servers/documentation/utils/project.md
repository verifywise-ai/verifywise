# Project Database Queries Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Database Functions](#database-functions)
- [Data Types](#data-types)
- [Query Operations](#query-operations)

## Overview

This module provides database query functions for managing projects in a PostgreSQL database.

## Dependencies

```typescript
import { Project } from "../models/project.model";
import pool from "../database/db";
```

## Database Functions

### Get All Projects

```typescript
export const getAllProjectsQuery = async (): Promise<Project[]>
```

- **Description**: Retrieves all projects from the database
- **Returns**: Promise resolving to an array of Project objects
- **SQL Query**: `SELECT * FROM projects`

### Get Project by ID

```typescript
export const getProjectByIdQuery = async (id: number): Promise<Project | null>
```

- **Description**: Retrieves a specific project by ID
- **Parameters**: `id` - Project ID
- **Returns**: Promise resolving to a Project object or null if not found
- **SQL Query**: `SELECT * FROM projects WHERE id = $1`

### Create Project

```typescript
export const createNewProjectQuery = async (project: {
  project_title: string;
  owner: number;
  users: string;
  start_date: Date;
  ai_risk_classification: string;
  type_of_high_risk_role: string;
  goal: string;
  last_updated?: Date;
  last_updated_by?: number;
}): Promise<Project>
```

- **Description**: Creates a new project
- **Parameters**: project object with required fields
- **Returns**: Promise resolving to the created Project object
- **SQL Query**: INSERT with all fields and RETURNING clause

### Update Project

```typescript
export const updateProjectByIdQuery = async (
  id: number,
  project: Partial<ProjectModel>,
  members: number[] | undefined,
  organizationId: number,
  transaction: Transaction,
): Promise<(IProjectAttributes & { members: number[] }) | null>
```

- **Description**: Updates an existing use case and, optionally, its member list
- **Parameters**:
  - `id` - Project ID
  - `project` - Partial project object; only the columns present are updated
  - `members` - The full member list to store, or `undefined` to leave members unchanged. Ids may arrive as strings from the client; they are converted to numbers and de-duplicated before the diff. An empty array removes every member. `PATCH /projects/:id` passes `undefined` when the body has no `members` field and `[]` for `members: null`; `PATCH /projects/:id/status` always passes `undefined`.
  - `organizationId` - Tenant scope for every query
  - `transaction` - Caller's transaction
- **Returns**: Promise resolving to the updated project with its `members`, or null if not found
- **SQL Query**: Dynamic UPDATE of the provided columns. When no column changes (a members-only update), the row is read with a SELECT instead, since `UPDATE projects SET WHERE` is invalid SQL.

### Delete Project

```typescript
export const deleteProjectByIdQuery = async (id: number): Promise<Project | null>
```

- **Description**: Deletes a project by ID
- **Parameters**: `id` - Project ID
- **Returns**: Promise resolving to the deleted Project object or null if not found
- **SQL Query**: `DELETE FROM projects WHERE id = $1 RETURNING *`

## Data Types

```typescript
interface Project {
  id?: number;
  project_title: string;
  owner: number;
  users: string;
  start_date: Date;
  ai_risk_classification: string;
  type_of_high_risk_role: string;
  goal: string;
  last_updated?: Date;
  last_updated_by?: number;
}
```

## Query Operations

All database operations:

- Use parameterized queries for security
- Return the affected rows using `RETURNING *`
- Include console logging for debugging
- Handle potential null cases for single-record operations
- Support partial updates with dynamic query building
- Return typed promises using the Project interface
