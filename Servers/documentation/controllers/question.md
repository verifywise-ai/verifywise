# Question Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages question-related operations, providing CRUD functionality for questions with file handling capabilities.

## Dependencies

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## API Endpoints

### Get All Questions

- **Endpoint**: GET `/questions`
- **Description**: Retrieves all questions
- **Response**:
  - 200: Success with questions data
  - 204: No content
  - 500: Server error

### Get Question by ID

- **Endpoint**: GET `/questions/:id`
- **Description**: Retrieves a specific question by ID
- **Response**:
  - 200: Success with question data
  - 404: Question not found
  - 500: Server error

### Create Question

- **Endpoint**: POST `/questions`
- **Request Body**:

```typescript
{
  subtopicId: number;
  questionText: string;
  answerType: string;
  evidenceFileRequired: boolean;
  hint: string;
  isRequired: boolean;
  priorityLevel: string;
  answer: string;
}
```

- **Required Fields**: subtopicId, questionText, answerType, isRequired
- **File Upload**: Supports file attachments
- **Response**:
  - 201: Created
  - 400: Bad request
  - 503: Service unavailable
  - 500: Server error

### Update Question

- **Endpoint**: PUT `/questions/:id`
- **Request Body**:

```typescript
{
  subtopicId: number;
  questionText: string;
  answerType: string;
  evidenceFileRequired: boolean;
  hint: string;
  isRequired: boolean;
  priorityLevel: string;
}
```

- **Required Fields**: subtopicId, questionText, answerType, isRequired
- **File Upload**: Supports file attachments
- **Response**:
  - 202: Accepted
  - 400: Bad request
  - 404: Not found
  - 500: Server error

### Delete Question

- **Endpoint**: DELETE `/questions/:id`
- **Response**:
  - 202: Accepted
  - 404: Not found
  - 500: Server error

## Data Types

```typescript
interface Question {
  subtopicId: number;
  questionText: string;
  answerType: string;
  evidenceFileRequired: boolean;
  hint: string;
  isRequired: boolean;
  priorityLevel: string;
  answer?: string;
}

interface RequestWithFile extends Request {
  files?: any;
}
```

## Error Handling

The controller uses HTTP status codes and a standardized STATUS_CODE utility for error responses:

- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error
- 503: Service Unavailable

All endpoints are wrapped in try-catch blocks for error handling, returning appropriate status codes and error messages.
