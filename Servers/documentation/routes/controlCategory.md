# Control Category Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages control category-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Control Categories**
  - Route: `/`
  - Handler: `getAllControlCategories`
  - Authentication: JWT (currently commented out)

- **Get Control Category by ID**
  - Route: `/:id`
  - Handler: `getControlCategoryById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Control Category**
  - Route: `/`
  - Handler: `createControlCategory`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Control Category**
  - Route: `/:id`
  - Handler: `updateControlCategoryById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Control Category**
  - Route: `/:id`
  - Handler: `deleteControlCategoryById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
