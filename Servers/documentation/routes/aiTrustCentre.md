# AI Trust Centre Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)

## Overview

This router manages AI Trust Centre-related routes, providing endpoints for CRUD operations on AI Trust Centre overview data.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### POST Routes

- **Create AI Trust Centre Overview**
  - Route: `/overview`
  - Handler: `createAITrustCentreOverview`
  - Authentication: JWT required

### GET Routes

- **Get AI Trust Centre Overview**
  - Route: `/overview`
  - Handler: `getAITrustCentreOverview`
  - Authentication: JWT required

### PUT Routes

- **Update AI Trust Centre Overview**
  - Route: `/overview`
  - Handler: `updateAITrustCentreOverview`
  - Authentication: JWT required

## Authentication

All routes require JWT authentication middleware (`authenticateJWT`).

## API Endpoints

### Create AI Trust Centre Overview

**Endpoint**: `POST /api/aiTrustCentre/overview`

**Description**: Creates or updates AI Trust Centre overview data for an organization.

**Request Body**:

```json
{
  "intro": {
    "intro_visible": true,
    "purpose_visible": true,
    "purpose_text": "Our Trust Center demonstrates our commitment to responsible AI practices.",
    "our_statement_visible": true,
    "our_statement_text": "We are committed to ethical AI development.",
    "our_mission_visible": true,
    "our_mission_text": "To build trust through responsible AI innovation."
  },
  "compliance_badges": {
    "badges_visible": true,
    "SOC2_Type_I": true,
    "SOC2_Type_II": true,
    "ISO_27001": true,
    "ISO_42001": true,
    "CCPA": true,
    "GDPR": true,
    "HIPAA": true,
    "EU_AI_Act": true
  },
  "company_info": {
    "company_info_visible": true,
    "background_visible": true,
    "background_text": "We are a leading AI company focused on ethical development.",
    "core_benefit_visible": true,
    "core_benefit_text": "Our AI solutions provide enhanced security and efficiency.",
    "compliance_doc_visible": true,
    "compliance_doc_text": "Access our comprehensive compliance documentation."
  },
  "terms_and_contact": {
    "is_visible": true,
    "has_terms_of_service": true,
    "terms_of_service": "https://example.com/terms-of-service",
    "has_privacy_policy": true,
    "privacy_policy": "https://example.com/privacy-policy",
    "has_company_email": true,
    "company_email": "privacy@example.com"
  }
}
```

**Response**:

- `201`: Created successfully
- `400`: Bad request (validation errors)
- `500`: Server error

### Get AI Trust Centre Overview

**Endpoint**: `GET /api/aiTrustCentre/overview`

**Description**: Retrieves AI Trust Centre overview data for the current organization.

**Response**:

- `200`: Success with overview data
- `404`: Overview not found
- `500`: Server error

**Response Body**:

```json
{
  "status": 200,
  "message": "AI Trust Centre overview retrieved successfully",
  "data": {
    "intro": {
      /* intro data */
    },
    "compliance_badges": {
      /* compliance badges data */
    },
    "company_info": {
      /* company info data */
    },
    "terms_and_contact": {
      /* terms and contact data */
    }
  }
}
```

### Update AI Trust Centre Overview

**Endpoint**: `PUT /api/aiTrustCentre/overview`

**Description**: Updates AI Trust Centre overview data. Supports partial updates.

**Request Body**: Same structure as POST, but all fields are optional.

**Response**:

- `200`: Updated successfully
- `400`: Bad request (validation errors)
- `500`: Server error

## Data Models

### Intro Section

- `intro_visible`: boolean - Whether the intro section is visible
- `purpose_visible`: boolean - Whether the purpose section is visible
- `purpose_text`: string (optional) - Purpose text content
- `our_statement_visible`: boolean - Whether the statement section is visible
- `our_statement_text`: string (optional) - Statement text content
- `our_mission_visible`: boolean - Whether the mission section is visible
- `our_mission_text`: string (optional) - Mission text content

### Compliance Badges Section

- `badges_visible`: boolean - Whether the badges section is visible
- `SOC2_Type_I`: boolean - SOC2 Type I certification
- `SOC2_Type_II`: boolean - SOC2 Type II certification
- `ISO_27001`: boolean - ISO 27001 certification
- `ISO_42001`: boolean - ISO 42001 certification
- `CCPA`: boolean - CCPA compliance
- `GDPR`: boolean - GDPR compliance
- `HIPAA`: boolean - HIPAA compliance
- `EU_AI_Act`: boolean - EU AI Act compliance

### Company Info Section

- `company_info_visible`: boolean - Whether the company info section is visible
- `background_visible`: boolean - Whether the background section is visible
- `background_text`: string (optional) - Background text content
- `core_benefit_visible`: boolean - Whether the core benefits section is visible
- `core_benefit_text`: string (optional) - Core benefits text content
- `compliance_doc_visible`: boolean - Whether the compliance docs section is visible
- `compliance_doc_text`: string (optional) - Compliance docs text content

### Terms and Contact Section

- `is_visible`: boolean - Whether the terms and contact section is visible
- `has_terms_of_service`: boolean - Whether terms of service are provided
- `terms_of_service`: string (optional) - Terms of service URL
- `has_privacy_policy`: boolean - Whether privacy policy is provided
- `privacy_policy`: string (optional) - Privacy policy URL
- `has_company_email`: boolean - Whether company email is provided
- `company_email`: string (optional) - Company email address

## Validation

The API includes comprehensive validation in the controller layer:

- All boolean fields must be boolean values
- Text fields are optional but must be strings when provided
- URL fields should contain valid URLs when provided
- Organization ID is automatically set to 1 for all operations

## Error Handling

- `400 Bad Request`: Validation errors with specific field messages
- `404 Not Found`: Overview data not found for the organization
- `500 Internal Server Error`: Database or server errors
- `503 Service Unavailable`: Database operation failures
