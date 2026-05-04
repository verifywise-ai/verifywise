# Question Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [File Upload Configuration](#file-upload-configuration)
- [Authentication](#authentication)

## Overview

This router manages question-related routes, providing endpoints for CRUD operations with file upload support.

## Dependencies

```typescript
import express from "express";
import multer from "multer";
import authenticateJWT from "../middleware/auth.middleware";
```

## File Upload Configuration

```typescript
const upload = multer({ Storage: multer.memoryStorage() });
```

## Routes Configuration

### GET Routes

- **Get All Questions**
  - Route: `/`
  - Handler: `getAllQuestions`
  - Authentication: JWT (currently commented out)

- **Get Question by ID**
  - Route: `/:id`
  - Handler: `getQuestionById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Question**
  - Route: `/`
  - Handler: `createQuestion`
  - Middleware:
    - File Upload: `upload.any("files")`
    - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Question**
  - Route: `/:id`
  - Handler: `updateQuestionById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Question**
  - Route: `/:id`
  - Handler: `deleteQuestionById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
