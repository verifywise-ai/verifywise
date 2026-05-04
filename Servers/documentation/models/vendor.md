# Vendor Type Documentation

## Table of Contents

- [Overview](#overview)
- [Data Type Definition](#data-type-definition)
- [Properties](#properties)

## Overview

This file defines the Vendor type which represents the structure for vendor data, including both vendor details and risk assessment information.

## Data Type Definition

```typescript
type Vendor = {
  id: number;
  vendorName: string;
  website: string;
  projectId: number;
  vendorProvides: string;
  vendorContactPerson: string;
  reviewStatus: string;
  reviewer: string;
  reviewResult: string;
  assignee: string;
  reviewDate: Date;
  riskDescription: string;
  impactDescription: string;
  impact: number;
  probability: number;
  riskSeverity: number;
  actionOwner: string;
  actionPlan: string;
  riskLevel: "Very high risk" | "High risk" | "Medium risk" | "Low risk" | "Very low risk";
  likelihood: number;
};
```

## Properties

| Property            | Type   | Description                               |
| ------------------- | ------ | ----------------------------------------- |
| id                  | number | Unique identifier for the vendor          |
| vendorName          | string | Name of the vendor                        |
| website             | string | Vendor's website URL                      |
| projectId           | number | Reference to the associated project       |
| vendorProvides      | string | Description of services/products provided |
| vendorContactPerson | string | Name of vendor contact person             |
| reviewStatus        | string | Current status of vendor review           |
| reviewer            | string | Name of the reviewer                      |
| reviewResult        | string | Outcome of the vendor review              |
| assignee            | string | Person assigned to vendor management      |
| reviewDate          | Date   | Date of vendor review                     |
| riskDescription     | string | Description of identified risks           |
| impactDescription   | string | Description of potential impact           |
| impact              | number | Impact rating value                       |
| probability         | number | Probability rating value                  |
| riskSeverity        | number | Risk severity rating                      |
| actionOwner         | string | Person responsible for risk actions       |
| actionPlan          | string | Plan to address identified risks          |
| riskLevel           | enum   | Overall risk level assessment             |
| likelihood          | number | Likelihood rating value                   |
