# Project Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages project-related operations, providing CRUD functionality for projects and associated project statistics.

## Dependencies

```typescript
import { Request, Response } from "express";
import { MOCKDATA_ON } from "../flags";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## API Endpoints

### Get All Projects

- **Endpoint**: GET `/projects`
- **Description**: Retrieves all projects
- **Response**:
  - 200: Success with projects data
  - 204: No content
  - 500: Server error

### Get Project by ID

- **Endpoint**: GET `/projects/:id`
- **Description**: Retrieves a specific project by ID
- **Response**:
  - 200: Success with project data
  - 404: Project not found
  - 500: Server error

### Create Project

- **Endpoint**: POST `/projects`
- **Request Body**:

```typescript
{
  project_title: string;
  owner: number;
  users: string;
  start_date: Date;
  ai_risk_classification: string;
  high_risk_roles: HighRiskRole[]; // "Provider", "Deployer" or both
  goal: string;
  last_updated?: Date;
  last_updated_by?: number;
}
```

- **Response**:
  - 201: Created with project and assessment data. The project carries `high_risk_roles` and the derived, deprecated `type_of_high_risk_role` (Provider if the list holds Provider, Deployer if only Deployer, null if empty). Requests may still send `type_of_high_risk_role` instead of `high_risk_roles`.
  - 400: Bad request
  - 503: Service unavailable
  - 500: Server error

### Update Project

- **Endpoint**: PUT `/projects/:id`
- **Request Body**:

```typescript
{
  project_title: string;
  owner: string;
  users: string;
  start_date: Date;
  ai_risk_classification: string;
  high_risk_roles: HighRiskRole[]; // "Provider", "Deployer" or both
  goal: string;
  last_updated: Date;
  last_updated_by: string;
}
```

- **Response**:
  - 202: Accepted
  - 400: Bad request
  - 404: Not found
  - 500: Server error

### Delete Project

- **Endpoint**: DELETE `/projects/:id`
- **Response**:
  - 202: Accepted
  - 404: Not found
  - 500: Server error

### Get Project Stats

- **Endpoint**: GET `/projects/:id/stats`
- **Description**: Retrieves project statistics including owner and last update information
- **Response Format**:

```typescript
{
  user: {
    name: string;
    surname: string;
    email: string;
    project_last_updated: Date;
    userWhoUpdated: any;
  }
}
```

## Data Types

```typescript
interface Project {
  project_title: string;
  owner: number;
  users: string;
  start_date: Date;
  ai_risk_classification: string;
  high_risk_roles: HighRiskRole[]; // "Provider", "Deployer" or both
  goal: string;
  last_updated?: Date;
  last_updated_by?: number;
}
```

## Error Handling

The controller uses HTTP status codes and a standardized STATUS_CODE utility for error responses:

- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error
- 503: Service Unavailable

All endpoints are wrapped in try-catch blocks for error handling, returning appropriate status codes and error messages.
