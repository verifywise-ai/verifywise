# Project Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages project-related routes, providing endpoints for CRUD operations and project statistics.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Projects**
  - Route: `/`
  - Handler: `getAllProjects`
  - Authentication: JWT (currently commented out)

- **Get Project by ID**
  - Route: `/:id`
  - Handler: `getProjectById`
  - Authentication: JWT (currently commented out)

- **Get Project Stats**
  - Route: `/stats/:id`
  - Handler: `getProjectStatsById`
  - Authentication: None

### POST Routes

- **Create Project**
  - Route: `/`
  - Handler: `createProject`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Project**
  - Route: `/:id`
  - Handler: `updateProjectById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Project**
  - Route: `/:id`
  - Handler: `deleteProjectById`
  - Authentication: JWT (currently commented out)

## Authentication

Most routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation. The project stats route does not include authentication.
