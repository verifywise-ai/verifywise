# Project Risks Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages project risk-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Project Risks**
  - Route: `/`
  - Handler: `getAllProjectRisks`
  - Authentication: JWT (currently commented out)

- **Get Project Risk by ID**
  - Route: `/:id`
  - Handler: `getProjectRiskById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Project Risk**
  - Route: `/`
  - Handler: `createProjectRisk`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Project Risk**
  - Route: `/:id`
  - Handler: `updateProjectRiskById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Project Risk**
  - Route: `/:id`
  - Handler: `deleteProjectRiskById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
