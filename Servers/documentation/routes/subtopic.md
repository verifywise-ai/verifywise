# Subtopic Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages subtopic-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Subtopics**
  - Route: `/`
  - Handler: `getAllSubtopics`
  - Authentication: JWT (currently commented out)

- **Get Subtopic by ID**
  - Route: `/:id`
  - Handler: `getSubtopicById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Subtopic**
  - Route: `/`
  - Handler: `createNewSubtopic`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Subtopic**
  - Route: `/:id`
  - Handler: `updateSubtopicById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Subtopic**
  - Route: `/:id`
  - Handler: `deleteSubtopicById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
