# Vendor Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages vendor-related operations, providing CRUD functionality for vendors with support for both mock and real data handling.

## Dependencies

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## API Endpoints

### Get All Vendors

- **Endpoint**: GET `/vendors`
- **Description**: Retrieves all vendors
- **Response**:
  - 200: Success with vendors data
  - 204: No content
  - 500: Server error

### Get Vendor by ID

- **Endpoint**: GET `/vendors/:id`
- **Description**: Retrieves a specific vendor by ID
- **Response**:
  - 200: Success with vendor data
  - 404: Vendor not found
  - 500: Server error

### Create Vendor

- **Endpoint**: POST `/vendors`
- **Request Body**:

```typescript
{
  projectId: number;
  vendorName: string;
  assignee: string;
  vendorProvides: string;
  website: string;
  vendorContactPerson: string;
  reviewResult: string;
  reviewStatus: string;
  reviewer: string;
  riskStatus: string;
  reviewDate: Date;
  riskDescription: string;
  impactDescription: string;
  impact: number;
  probability: number;
  actionOwner: string;
  actionPlan: string;
  riskSeverity: number;
  riskLevel: string;
  likelihood: number;
}
```

- **Required Fields**: vendorName, vendorProvides
- **Response**:
  - 201: Created
  - 400: Bad request (missing required fields)
  - 503: Service unavailable
  - 500: Server error

### Update Vendor

- **Endpoint**: PUT `/vendors/:id`
- **Request Body**: Same as Create Vendor
- **Required Fields**: vendorName, vendorProvides
- **Response**:
  - 202: Accepted
  - 400: Bad request (missing required fields)
  - 404: Vendor not found
  - 500: Server error

### Delete Vendor

- **Endpoint**: DELETE `/vendors/:id`
- **Response**:
  - 202: Accepted
  - 404: Vendor not found
  - 500: Server error

## Data Types

```typescript
interface Vendor {
  projectId: number;
  vendorName: string;
  assignee: string;
  vendorProvides: string;
  website: string;
  vendorContactPerson: string;
  reviewResult: string;
  reviewStatus: string;
  reviewer: string;
  riskStatus: string;
  reviewDate: Date;
  riskDescription: string;
  impactDescription: string;
  impact: number;
  probability: number;
  actionOwner: string;
  actionPlan: string;
  riskSeverity: number;
  riskLevel: string;
  likelihood: number;
}
```

## Error Handling

The controller uses HTTP status codes and a standardized STATUS_CODE utility for error responses:

- 200: Success
- 201: Created
- 202: Accepted
- 204: No Content
- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error
- 503: Service Unavailable

All endpoints are wrapped in try-catch blocks for error handling.
