# Control Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages control-related routes, providing endpoints for CRUD operations and control management.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Controls**
  - Route: `/`
  - Handler: `getAllControls`
  - Authentication: JWT (currently commented out)

- **Get Control by ID**
  - Route: `/:id`
  - Handler: `getControlById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Control**
  - Route: `/`
  - Handler: `createControl`
  - Authentication: JWT (currently commented out)

- **Save Controls**
  - Route: `/saveControls`
  - Handler: `saveControls`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Control**
  - Route: `/:id`
  - Handler: `updateControlById`
  - Authentication: JWT (currently commented out)

- **Update Controls**
  - Route: `/updateControls/:id`
  - Handler: `updateControls`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Control**
  - Route: `/:id`
  - Handler: `deleteControlById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
