# Project Scope Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages project scope-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Project Scopes**
  - Route: `/`
  - Handler: `getAllProjectScopes`
  - Authentication: JWT (currently commented out)

- **Get Project Scope by ID**
  - Route: `/:id`
  - Handler: `getProjectScopeById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Project Scope**
  - Route: `/`
  - Handler: `createProjectScope`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Project Scope**
  - Route: `/:id`
  - Handler: `updateProjectScopeById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Project Scope**
  - Route: `/:id`
  - Handler: `deleteProjectScopeById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
