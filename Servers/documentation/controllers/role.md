# Role Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages role-related operations, providing CRUD functionality for roles.

## Dependencies

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## API Endpoints

### Get All Roles

- **Endpoint**: GET `/roles`
- **Description**: Retrieves all roles
- **Response**:
  - 200: Success with roles data
  - 204: No content
  - 500: Server error

### Get Role by ID

- **Endpoint**: GET `/roles/:id`
- **Description**: Retrieves a specific role by ID
- **Response**:
  - 200: Success with role data
  - 404: Role not found
  - 500: Server error

### Create Role

- **Endpoint**: POST `/roles`
- **Request Body**:

```typescript
{
  projectId: number;
}
```

- **Required Fields**: projectId
- **Response**:
  - 201: Created
  - 400: Bad request
  - 503: Service unavailable
  - 500: Server error

### Update Role

- **Endpoint**: PUT `/roles/:id`
- **Request Body**:

```typescript
{
  projectId: number;
}
```

- **Required Fields**: projectId
- **Response**:
  - 202: Accepted
  - 400: Bad request
  - 404: Not found
  - 500: Server error

### Delete Role

- **Endpoint**: DELETE `/roles/:id`
- **Response**:
  - 202: Accepted
  - 404: Not found
  - 500: Server error

## Data Types

```typescript
interface Role {
  projectId: number;
}
```

## Error Handling

The controller uses HTTP status codes and a standardized STATUS_CODE utility for error responses:

- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error
- 503: Service Unavailable

All endpoints are wrapped in try-catch blocks for error handling, returning appropriate status codes and error messages.
