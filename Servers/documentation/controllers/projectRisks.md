# Project Risk Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages project risk-related operations, providing CRUD functionality for project risks.

## Dependencies

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## API Endpoints

### Get All Project Risks

- **Endpoint**: GET `/project-risks`
- **Description**: Retrieves all project risks
- **Response**:
  - 200: Success with project risks data
  - 204: No content
  - 500: Server error

### Get Project Risk by ID

- **Endpoint**: GET `/project-risks/:id`
- **Description**: Retrieves a specific project risk by ID
- **Response**:
  - 200: Success with project risk data
  - 204: No content
  - 500: Server error

### Create Project Risk

- **Endpoint**: POST `/project-risks`
- **Request Body**:

```typescript
{
  project_id: number;
  risk_name: string;
  risk_owner: string;
  ai_lifecycle_phase: string;
  risk_description: string;
  risk_category: string;
  impact: string;
  assessment_mapping: string;
  controls_mapping: string;
  likelihood: string;
  severity: string;
  risk_level_autocalculated: string;
  review_notes: string;
  mitigation_status: string;
  current_risk_level: string;
  deadline: Date;
  mitigation_plan: string;
  implementation_strategy: string;
  mitigation_evidence_document: string;
  likelihood_mitigation: string;
  risk_severity: string;
  final_risk_level: string;
  risk_approval: string;
  approval_status: string;
  date_of_assessment: Date;
}
```

- **Response**:
  - 201: Created
  - 204: No content
  - 500: Server error

### Update Project Risk

- **Endpoint**: PUT `/project-risks/:id`
- **Request Body**: `Partial<ProjectRisk>`
- **Response**:
  - 200: Success
  - 204: No content
  - 500: Server error

### Delete Project Risk

- **Endpoint**: DELETE `/project-risks/:id`
- **Response**:
  - 200: Success
  - 204: No content
  - 500: Server error

## Data Types

```typescript
interface ProjectRisk {
  project_id: number;
  risk_name: string;
  risk_owner: string;
  ai_lifecycle_phase: string;
  risk_description: string;
  risk_category: string;
  impact: string;
  assessment_mapping: string;
  controls_mapping: string;
  likelihood: string;
  severity: string;
  risk_level_autocalculated: string;
  review_notes: string;
  mitigation_status: string;
  current_risk_level: string;
  deadline: Date;
  mitigation_plan: string;
  implementation_strategy: string;
  mitigation_evidence_document: string;
  likelihood_mitigation: string;
  risk_severity: string;
  final_risk_level: string;
  risk_approval: string;
  approval_status: string;
  date_of_assessment: Date;
}
```

## Error Handling

The controller uses HTTP status codes and a standardized STATUS_CODE utility for error responses:

- 204: No Content
- 500: Internal Server Error

All endpoints are wrapped in try-catch blocks for error handling, returning appropriate status codes and error messages.
