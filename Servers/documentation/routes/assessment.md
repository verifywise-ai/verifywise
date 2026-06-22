# Assessment Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages assessment-related routes, providing endpoints for CRUD operations and answer retrieval.

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
  - Authentication: JWT

- **Get Assessment by ID**
  - Route: `/:id`
  - Handler: `getAssessmentById`
  - Authentication: JWT

- **Get Assessment by Project ID**
  - Route: `/project/byid/:id`
  - Handler: `getAssessmentByProjectId`
  - Authentication: JWT

- **Get Answers**
  - Route: `/getAnswers/:id`
  - Handler: `getAnswers`
  - Authentication: JWT

### POST Routes

- **Create Assessment**
  - Route: `/`
  - Handler: `createAssessment`
  - Authentication: JWT

### PUT Routes

- **Update Assessment**
  - Route: `/:id`
  - Handler: `updateAssessmentById`
  - Authentication: JWT

### DELETE Routes

- **Delete Assessment**
  - Route: `/:id`
  - Handler: `deleteAssessmentById`
  - Authentication: JWT

## Authentication

All routes require JWT authentication via the `authenticateJWT` middleware.
