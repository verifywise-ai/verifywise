# Vendor Risk Type Documentation

## Table of Contents

- [Overview](#overview)
- [Data Type Definition](#data-type-definition)
- [Properties](#properties)

## Overview

This file defines the VendorRisk type which represents the structure for vendor risk data.

## Data Type Definition

```typescript
type VendorRisk = {
  id: number;
  project_id: number;
  vendor_name: string;
  risk_name: string;
  owner: string;
  risk_level: "No risk" | "Low risk" | "Medium risk" | "High risk" | "Very high risk";
  review_date: Date;
};
```

## Properties

| Property    | Type   | Description                                     |
| ----------- | ------ | ----------------------------------------------- |
| id          | number | Unique identifier for the vendor risk           |
| project_id  | number | Foreign key reference to the associated project |
| vendor_name | string | Name of the vendor                              |
| risk_name   | string | Name or title of the risk                       |
| owner       | string | Person responsible for managing the risk        |
| risk_level  | enum   | Risk level classification                       |
| review_date | Date   | Date when the risk was reviewed                 |
