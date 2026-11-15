# Vendor Risk Controller Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [API Endpoints](#api-endpoints)
- [Data Types](#data-types)
- [Error Handling](#error-handling)

## Overview

This controller manages vendor risk-related operations, providing CRUD functionality for vendor risks with support for both mock and real data handling.

## Dependencies

```typescript
import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## API Endpoints

### Get All Vendor Risks

- **Endpoint**: GET `/vendor-risks`
- **Description**: Retrieves all vendor risks
- **Response**:
  - 200: Success with vendor risks data
  - 204: No content
  - 500: Server error

### Get Vendor Risk by ID

- **Endpoint**: GET `/vendor-risks/:id`
- **Description**: Retrieves a specific vendor risk by ID
- **Response**:
  - 200: Success with vendor risk data
  - 404: Vendor risk not found
  - 500: Server error

### Create Vendor Risk

- **Endpoint**: POST `/vendor-risks`
- **Request Body**:

```typescript
{
  project_id: number;
  vendor_name: string;
  risk_name: string;
  owner: string;
  risk_level: string;
  review_date: Date;
}
```

- **Required Fields**: All fields are required
- **Response**:
  - 201: Created
  - 400: Bad request (missing required fields)
  - 503: Service unavailable
  - 500: Server error

### Update Vendor Risk

- **Endpoint**: PUT `/vendor-risks/:id`
- **Request Body**: Same as Create Vendor Risk
- **Required Fields**: All fields are required
- **Response**:
  - 202: Accepted
  - 400: Bad request (missing required fields)
  - 404: Vendor risk not found
  - 500: Server error

### Delete Vendor Risk

- **Endpoint**: DELETE `/vendor-risks/:id`
- **Response**:
  - 202: Accepted
  - 404: Vendor risk not found
  - 500: Server error

## Data Types

```typescript
interface VendorRisk {
  project_id: number;
  vendor_name: string;
  risk_name: string;
  owner: string;
  risk_level: string;
  review_date: Date;
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
