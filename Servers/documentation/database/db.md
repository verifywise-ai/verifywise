# Database Configuration Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Configuration](#configuration)
- [Usage](#usage)
- [Environment Variables](#environment-variables)

## Overview

This module sets up a connection pool to a PostgreSQL database using the `pg` library. It provides a configurable database connection that can be used throughout the application.

## Dependencies

```typescript
import { Pool } from "pg";
import dotenv from "dotenv";
```

## Configuration

The database connection pool is configured using environment variables with fallback default values:

```typescript
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  port: Number(process.env.DB_PORT) || 5432,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "verifywise",
});
```

## Usage

```typescript
import pool from "./db";

// Example query
pool.query("SELECT * FROM users", (err, res) => {
  if (err) {
    console.error("Error executing query", err.stack);
  } else {
    console.log("Query result", res.rows);
  }
});
```

## Environment Variables

- `DB_HOST`: Database host (default: "localhost")
- `DB_USER`: Database user (required)
- `DB_PORT`: Database port (default: 5432)
- `DB_PASSWORD`: Database password (required)
- `DB_NAME`: Database name (default: "verifywise")
