# Role Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages role-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Roles**
  - Route: `/`
  - Handler: `getAllRoles`
  - Authentication: JWT (currently commented out)

- **Get Role by ID**
  - Route: `/:id`
  - Handler: `getRoleById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Role**
  - Route: `/`
  - Handler: `createRole`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Role**
  - Route: `/:id`
  - Handler: `updateRoleById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Role**
  - Route: `/:id`
  - Handler: `deleteRoleById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
