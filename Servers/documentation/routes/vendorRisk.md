# Vendor Risk Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages vendor risk-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Vendor Risks**
  - Route: `/`
  - Handler: `getAllVendorRisks`
  - Authentication: JWT (currently commented out)

- **Get Vendor Risk by ID**
  - Route: `/:id`
  - Handler: `getVendorRiskById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Vendor Risk**
  - Route: `/`
  - Handler: `createVendorRisk`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Vendor Risk**
  - Route: `/:id`
  - Handler: `updateVendorRiskById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Vendor Risk**
  - Route: `/:id`
  - Handler: `deleteVendorRiskById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
