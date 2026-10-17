# Projects Mock Data Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Data Structure](#data-structure)
- [Sample Data](#sample-data)

## Overview

This file contains mock project data that represents AI-related projects with their associated risk classifications, roles, and metadata.

## Dependencies

```typescript
import { Project } from "../models/project.model";
```

## Data Structure

```typescript
interface Project {
  id: number;
  project_title: string;
  owner: number;
  users: string;
  start_date: Date;
  ai_risk_classification: string;
  high_risk_roles: string[];
  goal: string;
  last_updated: Date;
  last_updated_by: number;
}
```

## Sample Data

The file contains two predefined project records:

```typescript
{
  id: 1,
  project_title: "AI Compliance Checker",
  owner: 1,
  users: "[1, 2, 3]",
  start_date: new Date("2023-01-15"),
  ai_risk_classification: "high risk",
  high_risk_roles: ["Deployer"],
  goal: "To ensure compliance with AI governance standards",
  last_updated: new Date("2024-10-30"),
  last_updated_by: 1
}
```

Risk Classifications:

- high risk
- limited risk

High Risk Roles:

- deployer
- provider
