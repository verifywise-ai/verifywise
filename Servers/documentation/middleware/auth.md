# JWT Authentication Middleware Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Functionality](#functionality)
- [Error Handling](#error-handling)
- [Usage](#usage)

## Overview

This middleware handles JWT (JSON Web Token) authentication for protected routes in the Express application.

## Dependencies

```typescript
import { NextFunction, Request, Response } from "express";
import { getTokenPayload } from "../utils/jwt.util";
import { STATUS_CODE } from "../utils/statusCode.utils";
```

## Functionality

```typescript
const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  // ...middleware implementation
};
```

The middleware:

1. Extracts the JWT from the Authorization header
2. Validates the token's presence
3. Decodes and verifies the token
4. Checks token expiration
5. Allows the request to proceed if authentication is successful

## Error Handling

The middleware handles several authentication scenarios:

- **Missing Token** (400 Bad Request)
  - When Authorization header is missing or malformed
- **Invalid Token** (401 Unauthorized)
  - When token payload cannot be decoded or is invalid

- **Expired Token** (406 Not Acceptable)
  - When token's expiration time has passed

- **Server Error** (500 Internal Server Error)
  - For any other unexpected errors during authentication

## Usage

```typescript
import authenticateJWT from "./middleware/authenticateJWT";

// Apply to individual routes
app.get("/protected-route", authenticateJWT, routeHandler);

// Or apply to all routes under a router
router.use(authenticateJWT);
```
