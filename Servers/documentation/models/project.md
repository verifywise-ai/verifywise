# Project Type Documentation

## Table of Contents

- [Overview](#overview)
- [Data Type Definition](#data-type-definition)
- [Properties](#properties)

## Overview

This file defines the Project type which represents the structure for project data.

## Data Type Definition

```typescript
type Project = {
  id: number;
  project_title: string;
  owner: number;
  users: string;
  start_date: Date;
  ai_risk_classification: "high risk" | "limited risk" | "minimal risk";
  high_risk_roles: ("Provider" | "Deployer")[];
  goal: string;
  last_updated: Date;
  last_updated_by: number;
};
```

## Properties

| Property               | Type   | Description                                                         |
| ---------------------- | ------ | ------------------------------------------------------------------- |
| id                     | number | Unique identifier for the project                                   |
| project_title          | string | Title of the project                                                |
| owner                  | number | Identifier of the project owner                                     |
| users                  | string | Users associated with the project                                   |
| start_date             | Date   | Project start date                                                  |
| ai_risk_classification | enum   | Risk classification: "high risk", "limited risk", or "minimal risk" |
| high_risk_roles        | text[] | EU AI Act roles: "Provider", "Deployer" or both (Provider first)    |
| goal                   | string | Project goal description                                            |
| last_updated           | Date   | Last update timestamp                                               |
| last_updated_by        | number | Identifier of the user who last updated the project                 |
