# Assessment Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages assessment-related operations, providing functionality for creating, reading, updating, and deleting assessments, as well as handling answers and their associated topics, subtopics, and questions.

## Dependencies

```typescript
import { Request, Response } from "express";
import { MOCKDATA_ON } from "../flags";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## API Endpoints

### Get All Assessments

- **Endpoint**: GET `/assessments`
- **Description**: Retrieves all assessments
- **Response**:
  - 200: Success with assessments data
  - 204: No content
  - 500: Server error

### Get Assessment by ID

- **Endpoint**: GET `/assessments/:id`
- **Description**: Retrieves a specific assessment by ID
- **Response**:
  - 200: Success with assessment data
  - 404: Assessment not found
  - 500: Server error

### Create Assessment

- **Endpoint**: POST `/assessments`
- **Request Body**:

```typescript
{
  projectId: number;
}
```

- **Response**:
  - 201: Created
  - 400: Bad request
  - 503: Service unavailable
  - 500: Server error

### Update Assessment

- **Endpoint**: PUT `/assessments/:id`
- **Request Body**:

```typescript
{
  projectId: number;
}
```

- **Response**:
  - 202: Accepted
  - 400: Bad request
  - 404: Not found
  - 500: Server error

### Delete Assessment

- **Endpoint**: DELETE `/assessments/:id`
- **Response**:
  - 202: Accepted
  - 404: Not found
  - 500: Server error

### Save Answers

- **Endpoint**: POST `/assessments/answers`
- **Request Body**:

```typescript
{
  assessmentId: number;
  topic: string;
  subtopic: Array<{
    name: string;
    questions: Array<{
      question: string;
      answerType: string;
      evidenceFileRequired: boolean;
      hint: string;
      isRequired: boolean;
      priorityLevel: string;
      answer: string;
      evidenceFiles: any[];
    }>;
  }>;
}
```

### Update Answers

- **Endpoint**: PUT `/assessments/answers`
- **Request Body**:

```typescript
{
  assessmentId: number;
  topic: string;
  topicId: number;
  subtopic: Array<{
    id: number;
    name: string;
    questions: Array<{
      id: number;
      subtopicId: number;
      question: string;
      answerType: string;
      evidenceFileRequired: boolean;
      hint: string;
      isRequired: boolean;
      priorityLevel: string;
      answer: string;
      evidenceFiles: any[];
    }>;
  }>;
}
```

## Data Types

```typescript
interface Assessment {
  projectId: number;
}

interface Question {
  subtopicId: number;
  questionText: string;
  answerType: string;
  evidenceFileRequired: boolean;
  hint: string;
  isRequired: boolean;
  priorityLevel: string;
  answer: string;
  evidenceFiles: any[];
}
```

## Error Handling

The controller uses HTTP status codes and a standardized STATUS_CODE utility for error responses:

- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error
- 503: Service Unavailable

All endpoints are wrapped in try-catch blocks for error handling, returning appropriate status codes and error messages.
