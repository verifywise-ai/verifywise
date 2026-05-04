# Assessment Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages assessment-related routes, providing endpoints for CRUD operations and answer management.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Assessments**
  - Route: `/`
  - Handler: `getAllAssessments`
  - Authentication: JWT (currently commented out)

- **Get Assessment by ID**
  - Route: `/:id`
  - Handler: `getAssessmentById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Assessment**
  - Route: `/`
  - Handler: `createAssessment`
  - Authentication: JWT (currently commented out)

- **Save Answers**
  - Route: `/saveAnswers`
  - Handler: `saveAnswers`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Assessment**
  - Route: `/:id`
  - Handler: `updateAssessmentById`
  - Authentication: JWT (currently commented out)

- **Update Answers**
  - Route: `/updateAnswers/:id`
  - Handler: `updateAnswers`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Assessment**
  - Route: `/:id`
  - Handler: `deleteAssessmentById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
