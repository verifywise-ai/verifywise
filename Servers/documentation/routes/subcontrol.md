# Subcontrol Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages subcontrol-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Subcontrols**
  - Route: `/`
  - Handler: `getAllSubcontrols`
  - Authentication: JWT (currently commented out)

- **Get Subcontrol by ID**
  - Route: `/:id`
  - Handler: `getSubcontrolById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Subcontrol**
  - Route: `/`
  - Handler: `createNewSubcontrol`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Subcontrol**
  - Route: `/:id`
  - Handler: `updateSubcontrolById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Subcontrol**
  - Route: `/:id`
  - Handler: `deleteSubcontrolById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
