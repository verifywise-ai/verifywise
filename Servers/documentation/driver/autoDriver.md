# Database Auto Driver Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Data Structure](#data-structure)
- [Database Tables](#database-tables)
- [Functions](#functions)

## Overview

This module serves as a driver to insert mock data into the PostgreSQL database. It handles the creation of tables and population of mock data for multiple entities in the system.

## Dependencies

The module imports mock data and models from various files and utilizes utility functions for database operations.

## Data Structure

```typescript
interface TableEntry<T> {
  mockData: T[];
  tableName: string;
  createString: string;
  insertString: string;
  generateValuesString: (item: T) => string;
}

type TableList = [
  TableEntry<Role>,
  TableEntry<User>,
  TableEntry<Project>,
  TableEntry<Vendor>,
  TableEntry<Assessment>,
  TableEntry<ControlCategory>,
  TableEntry<Control>,
  TableEntry<Subcontrol>,
  TableEntry<ProjectRisk>,
  TableEntry<VendorRisk>,
  TableEntry<ProjectScope>,
  TableEntry<Topic>,
  TableEntry<Subtopic>,
  TableEntry<Question>,
];
```

## Database Tables

The system includes the following tables, created in order:

1. roles
2. users
3. projects
4. vendors
5. assessments
6. controlcategories
7. controls
8. subcontrols
9. projectrisks
10. vendorrisks
11. projectscopes
12. topics
13. subtopics
14. questions

Each table is created with specific columns and constraints, including foreign key references where applicable.

## Functions

### insertMockData

```typescript
async function insertMockData(): Promise<void>;
```

Main function that:

1. Checks if each table exists
2. Creates tables if they don't exist
3. Deletes existing data
4. Inserts mock data into tables

The function processes tables in sequence, maintaining referential integrity through the order defined in the TableList.

Each table insertion follows the pattern:

- Check table existence
- Create table if needed
- Clear existing data
- Generate and execute insert statement
