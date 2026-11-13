# User Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages user-related operations, including authentication, user management, and progress tracking.

## Dependencies

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import bcrypt from "bcrypt";
```

## API Endpoints

### Get All Users

- **Endpoint**: GET `/users`
- **Description**: Retrieves all users
- **Response**:
  - 200: Success with users data
  - 204: No content
  - 500: Server error

### Get User by Email

- **Endpoint**: GET `/users/email/:email`
- **Response**:
  - 200: Success with user data
  - 404: User not found
  - 500: Server error

### Get User by ID

- **Endpoint**: GET `/users/:id`
- **Response**:
  - 200: Success with user data
  - 404: User not found
  - 500: Server error

### Create User

- **Endpoint**: POST `/users`
- **Request Body**:

```typescript
{
  name: string;
  surname: string;
  email: string;
  password: string;
  role: string;
  created_at: Date;
  last_login: Date;
}
```

- **Response**:
  - 201: Created
  - 409: Conflict (user exists)
  - 400: Bad request
  - 500: Server error

### Login User

- **Endpoint**: POST `/users/login`
- **Request Body**:

```typescript
{
  email: string;
  password: string;
}
```

- **Response**:
  - 202: Accepted with JWT token
  - 406: Not acceptable
  - 404: User not found
  - 500: Server error

### Reset Password

- **Endpoint**: POST `/users/reset-password`
- **Request Body**:

```typescript
{
  email: string;
  newPassword: string;
}
```

- **Response**:
  - 202: Accepted
  - 404: User not found
  - 500: Server error

### Update User

- **Endpoint**: PUT `/users/:id`
- **Request Body**: Partial User object
- **Response**:
  - 202: Accepted
  - 404: Not found
  - 500: Server error

### Delete User

- **Endpoint**: DELETE `/users/:id`
- **Response**:
  - 202: Accepted
  - 404: Not found
  - 500: Server error

### Check User Exists

- **Endpoint**: GET `/users/exists`
- **Response**:
  - 200: Success with boolean
  - 500: Server error

### Calculate Progress

- **Endpoint**: GET `/users/:id/progress`
- **Description**: Calculates user's progress across projects, assessments, and controls
- **Response**:

```typescript
{
  controls: {
    projects: Array<{
      projectId: number;
      totalSubControls: number;
      doneSubControls: number;
    }>;
    totalSubControls: number;
    doneSubControls: number;
    percentageComplete: number;
  }
  assessments: {
    projects: Array<{
      projectId: number;
      totalAssessments: number;
      doneAssessments: number;
    }>;
    totalAssessments: number;
    doneAssessments: number;
    percentageComplete: number;
  }
}
```

## Authentication

The controller uses JWT tokens for authentication. Tokens are generated upon successful login and should be included in subsequent requests.

## Data Types

```typescript
interface User {
  id?: number;
  name: string;
  surname: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  last_login: Date;
}
```

## Error Handling

The controller uses HTTP status codes and a standardized STATUS_CODE utility for error responses:

- 400: Bad Request
- 404: Not Found
- 406: Not Acceptable
- 409: Conflict
- 500: Internal Server Error

All endpoints are wrapped in try-catch blocks for error handling, returning appropriate status codes and error messages.
