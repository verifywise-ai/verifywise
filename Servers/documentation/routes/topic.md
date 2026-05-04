# Topic Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages topic-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Topics**
  - Route: `/`
  - Handler: `getAllTopics`
  - Authentication: JWT (currently commented out)

- **Get Topic by ID**
  - Route: `/:id`
  - Handler: `getTopicById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Topic**
  - Route: `/`
  - Handler: `createNewTopic`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Topic**
  - Route: `/:id`
  - Handler: `updateTopicById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Topic**
  - Route: `/:id`
  - Handler: `deleteTopicById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
