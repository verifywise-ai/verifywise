# User Routes Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Routes Configuration](#routes-configuration)
- [Authentication](#authentication)

## Overview

This router manages user-related routes, providing endpoints for CRUD operations, authentication, and user management functionalities.

## Dependencies

```typescript
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
```

## Routes Configuration

### GET Routes

- **Get All Users**
  - Route: `/`
  - Handler: `getAllUsers`
  - Authentication: JWT (currently commented out)

- **Get User by Email**
  - Route: `/by-email/:email`
  - Handler: `getUserByEmail`
  - Authentication: JWT

- **Get User by ID**
  - Route: `/:id`
  - Handler: `getUserById`
  - Authentication: JWT (currently commented out)

- **Check User Exists**
  - Route: `/check/exists`
  - Handler: `checkUserExists`
  - Authentication: None

- **Calculate User Progress**
  - Route: `/:id/calculate-progress`
  - Handler: `calculateProgress`
  - Authentication: None

### POST Routes

- **Register User**
  - Route: `/register`
  - Handler: `createNewUser`
  - Authentication: None

- **Login User**
  - Route: `/login`
  - Handler: `loginUser`
  - Authentication: None

- **Reset Password**
  - Route: `/reset-password`
  - Handler: `resetPassword`
  - Authentication: None

### PATCH Routes

- **Update User**
  - Route: `/:id`
  - Handler: `updateUserById`
  - Authentication: JWT (currently commented out)

### DELETE Routes

- **Delete User**
  - Route: `/:id`
  - Handler: `deleteUserById`
  - Authentication: JWT (currently commented out)

## Authentication

Some routes are configured to use JWT authentication middleware (`authenticateJWT`). Authentication requirements vary by endpoint, with some routes requiring JWT authentication and others being publicly accessible.
