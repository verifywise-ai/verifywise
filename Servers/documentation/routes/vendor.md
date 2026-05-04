# Vendor Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages vendor-related routes, providing endpoints for CRUD operations.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Vendors**
  - Route: `/`
  - Handler: `getAllVendors`
  - Authentication: JWT (currently commented out)

- **Get Vendor by ID**
  - Route: `/:id`
  - Handler: `getVendorById`
  - Authentication: JWT (currently commented out)

### POST Routes

- **Create Vendor**
  - Route: `/`
  - Handler: `createVendor`
  - Authentication: JWT (currently commented out)

### PUT Routes

- **Update Vendor**
  - Route: `/:id`
  - Handler: `updateVendorById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete Vendor**
  - Route: `/:id`
  - Handler: `deleteVendorById`
  - Authentication: JWT (currently commented out)

## Authentication

All routes are configured to use JWT authentication middleware (`authenticateJWT`), though it is currently commented out in the implementation.
