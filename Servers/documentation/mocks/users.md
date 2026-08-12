# Users Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Data Structure](#data-structure)
- [Sample Data](#sample-data)

## Overview

This file defines user records with different roles and access permissions within the system.

## Dependencies

```typescript
import { User } from "../models/user.model";
```

## Data Structure

```typescript
interface User {
  id: number;
  name: string;
  surname: string;
  email: string;
  password_hash: string;
  role: number;
  created_at: Date;
  last_login: Date;
}
```

## Sample Data

The file contains predefined user records with various roles. Example:

```typescript
{
  id: 1,
  name: "Alice",
  surname: "Smith",
  email: "alice.smith@example.com",
  password_hash: "$2b$10$c7Mtd3kRpMjr6VexlxuAleT8Sy3SwPcT.YLCazH5QWBgnATDo5N6O", // nosemgrep: test/demo bcrypt hash
  role: 1,
  created_at: new Date("2024-01-01"),
  last_login: new Date("2024-10-01")
}
```

Key Categories:

- User Roles
  - Admin (role: 1)
  - Reviewer (role: 2)
  - Editor (role: 3)
  - Auditor (role: 4)
- User Information
  - Personal details (name, surname)
  - Authentication (email, password hash)
  - System tracking (created_at, last_login)
- Access Control
  - Role-based permissions
  - Account management
  - System access tracking
