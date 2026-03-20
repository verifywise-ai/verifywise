# Adding a New Compliance Framework

This guide explains how to add a new compliance framework to VerifyWise. The system currently supports EU AI Act, ISO 42001, ISO 27001, and NIST AI RMF. Follow these steps to add additional frameworks.

## Overview

Adding a framework requires:
1. Database tables for framework structure
2. Seed data for framework content
3. Backend models, routes, and controllers
4. Frontend components and integration
5. Report generation support

## Step 1: Define Framework Structure

Before coding, map out:
- **Categories/Sections**: Top-level groupings
- **Controls/Clauses**: Individual requirements
- **Evidence requirements**: What documentation is needed
- **Status options**: Compliance states

Example structure:
```
Framework: SOC 2
├── Category: Security
│   ├── Control: CC1.1 - Integrity and Ethical Values
│   ├── Control: CC1.2 - Board Oversight
│   └── ...
├── Category: Availability
│   ├── Control: A1.1 - Capacity Planning
│   └── ...
└── ...
```

## Step 2: Database Migration

### Main Framework Tables

Create migration in `Servers/database/migrations/`:

```javascript
// 20260117000000-create-soc2-framework-tables.js
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // All tables created once in verifywise schema
    // Tenant-scoped tables include organization_id column

    // Categories table (struct — shared, no org_id)
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.soc2_categories (
        id SERIAL PRIMARY KEY,
        category_id VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        order_no INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Controls table (tenant-scoped — with org_id)
    await queryInterface.sequelize.query(`
      CREATE TABLE verifywise.soc2_controls (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        control_id VARCHAR(50) NOT NULL,
        category_id INTEGER REFERENCES verifywise.soc2_categories(id),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'Not started',
        owner VARCHAR(255),
        implementation_notes TEXT,
        evidence_links JSONB DEFAULT '[]',
        order_no INTEGER DEFAULT 0,
        project_framework_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_soc2_controls_org ON verifywise.soc2_controls(organization_id);
      CREATE INDEX idx_soc2_controls_category ON verifywise.soc2_controls(category_id);
      CREATE INDEX idx_soc2_controls_pf ON verifywise.soc2_controls(project_framework_id);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.soc2_controls;
      DROP TABLE IF EXISTS verifywise.soc2_categories;
    `);
  },
};
```

### Add Framework Reference

Add to the public `frameworks` table:

```javascript
// Add in migration
await queryInterface.bulkInsert("frameworks", [
  {
    id: 5, // Next available ID
    name: "SOC 2",
    description: "Service Organization Control 2 Type II",
    created_at: new Date(),
    updated_at: new Date(),
  },
]);
```

## Step 3: Seed Data

Create seed file in `Servers/database/seeders/`:

```javascript
// soc2-framework-seed.js
module.exports = {
  async up(queryInterface, Sequelize) {
    // Seed shared struct data (no org_id needed)
    await queryInterface.bulkInsert(
      "soc2_categories",
      [
        {
          category_id: "CC",
          name: "Common Criteria",
          description: "Common Criteria related to...",
          order_no: 1,
        },
        {
          category_id: "A",
          name: "Availability",
          description: "Availability criteria...",
          order_no: 2,
        },
        // ... more categories
      ]
    );

    // Note: Tenant-scoped controls are created per-project
    // when a project subscribes to this framework, not in the seeder.
  },
};
```

## Step 4: Backend Models

Create models in `Servers/domain.layer/models/soc2/`:

```typescript
// soc2Category.model.ts
import { Table, Column, Model, DataType, HasMany } from "sequelize-typescript";

@Table({ tableName: "soc2_categories", timestamps: false })
export class SOC2CategoryModel extends Model {
  @Column({ primaryKey: true, autoIncrement: true, type: DataType.INTEGER })
  id!: number;

  @Column({ type: DataType.STRING(50), allowNull: false })
  category_id!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.TEXT })
  description?: string;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  order_no!: number;

  @HasMany(() => SOC2ControlModel)
  controls!: SOC2ControlModel[];
}
```

```typescript
// soc2Control.model.ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";

@Table({
  tableName: "soc2_controls",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
})
export class SOC2ControlModel extends Model {
  @Column({ primaryKey: true, autoIncrement: true, type: DataType.INTEGER })
  id!: number;

  @Column({ type: DataType.STRING(50), allowNull: false })
  control_id!: string;

  @ForeignKey(() => SOC2CategoryModel)
  @Column({ type: DataType.INTEGER })
  category_id!: number;

  @Column({ type: DataType.STRING(500), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT })
  description?: string;

  @Column({
    type: DataType.ENUM("Not started", "In progress", "Compliant", "Non-compliant", "Not applicable"),
    defaultValue: "Not started",
  })
  status!: string;

  @Column({ type: DataType.STRING(255) })
  owner?: string;

  @Column({ type: DataType.TEXT })
  implementation_notes?: string;

  @Column({ type: DataType.JSONB, defaultValue: [] })
  evidence_links!: number[];

  @Column({ type: DataType.INTEGER })
  project_framework_id?: number;

  @BelongsTo(() => SOC2CategoryModel)
  category!: SOC2CategoryModel;
}
```

## Step 5: Backend Utils

Create utils in `Servers/utils/`:

```typescript
// soc2.utils.ts
import { sequelize } from "../config/database";
import { QueryTypes, Transaction } from "sequelize";

export const getSOC2CategoriesQuery = async () => {
  const query = `
    SELECT * FROM soc2_categories
    ORDER BY order_no
  `;
  return sequelize.query(query, { type: QueryTypes.SELECT });
};

export const getSOC2ControlsQuery = async (
  projectFrameworkId: number,
  organizationId: number
) => {
  const query = `
    SELECT c.*, cat.name as category_name
    FROM soc2_controls c
    JOIN soc2_categories cat ON c.category_id = cat.id
    WHERE c.project_framework_id = :projectFrameworkId
      AND c.organization_id = :organizationId
    ORDER BY cat.order_no, c.order_no
  `;
  return sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { projectFrameworkId, organizationId },
  });
};

export const updateSOC2ControlQuery = async (
  id: number,
  data: Partial<any>,
  organizationId: number,
  transaction?: Transaction
) => {
  const setClauses: string[] = [];
  const replacements: Record<string, any> = { id, organizationId };

  if (data.status !== undefined) {
    setClauses.push("status = :status");
    replacements.status = data.status;
  }
  if (data.owner !== undefined) {
    setClauses.push("owner = :owner");
    replacements.owner = data.owner;
  }
  if (data.implementation_notes !== undefined) {
    setClauses.push("implementation_notes = :notes");
    replacements.notes = data.implementation_notes;
  }
  if (data.evidence_links !== undefined) {
    setClauses.push("evidence_links = :evidence");
    replacements.evidence = JSON.stringify(data.evidence_links);
  }
  setClauses.push("updated_at = NOW()");

  const query = `
    UPDATE soc2_controls
    SET ${setClauses.join(", ")}
    WHERE id = :id AND organization_id = :organizationId
    RETURNING *
  `;
  return sequelize.query(query, {
    type: QueryTypes.UPDATE,
    replacements,
    transaction,
  });
};

export const createSOC2ControlsForProjectQuery = async (
  projectFrameworkId: number,
  organizationId: number,
  transaction?: Transaction
) => {
  // Copy template controls to project-specific records
  const query = `
    INSERT INTO soc2_controls
      (organization_id, control_id, category_id, title, description, status, order_no, project_framework_id)
    SELECT :organizationId, control_id, category_id, title, description, 'Not started', order_no, :pfId
    FROM soc2_controls
    WHERE project_framework_id IS NULL AND organization_id = :organizationId
  `;
  return sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements: { pfId: projectFrameworkId, organizationId },
    transaction,
  });
};
```

## Step 6: Backend Routes and Controller

```typescript
// soc2.route.ts
import express from "express";
import { authenticateJWT } from "../middleware/auth.middleware";
import {
  getCategories,
  getControls,
  updateControl,
  getProgress,
} from "../controllers/soc2.ctrl";

const router = express.Router();

router.get("/categories", authenticateJWT, getCategories);
router.get("/controls/:projectFrameworkId", authenticateJWT, getControls);
router.patch("/controls/:id", authenticateJWT, updateControl);
router.get("/progress/:projectFrameworkId", authenticateJWT, getProgress);

export default router;
```

Register in `routes/index.ts`:
```typescript
import soc2Routes from "./soc2.route";
router.use("/soc2", soc2Routes);
```

## Step 7: Frontend Integration

### Add Framework ID Constant

```typescript
// constants/frameworks.ts
export const FRAMEWORK_IDS = {
  EU_AI_ACT: 1,
  ISO_42001: 2,
  ISO_27001: 3,
  NIST_AI_RMF: 4,
  SOC_2: 5,
};
```

### Create Framework Components

```typescript
// pages/SOC2/index.tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { soc2Repository } from "../../repository/soc2.repository";
import { SOC2Table } from "./SOC2Table";
import { ProgressCard } from "./ProgressCard";

export const SOC2Page = () => {
  const { projectFrameworkId } = useParams();
  const [controls, setControls] = useState([]);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const [controlsData, progressData] = await Promise.all([
        soc2Repository.getControls(projectFrameworkId),
        soc2Repository.getProgress(projectFrameworkId),
      ]);
      setControls(controlsData);
      setProgress(progressData);
    };
    fetchData();
  }, [projectFrameworkId]);

  return (
    <Box>
      <ProgressCard progress={progress} />
      <SOC2Table controls={controls} onUpdate={fetchData} />
    </Box>
  );
};
```

## Step 8: Report Integration

Add to `dataCollector.ts`:

```typescript
// In ReportDataCollector class
private async collectSOC2Controls(): Promise<SOC2SectionData> {
  const query = `
    SELECT c.*, cat.name as category_name
    FROM soc2_controls c
    JOIN soc2_categories cat ON c.category_id = cat.id
    WHERE c.project_framework_id = :pfId
      AND c.organization_id = :organizationId
    ORDER BY cat.order_no, c.order_no
  `;

  const controls = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { pfId: this.projectFrameworkId, organizationId: this.organizationId },
  });

  const grouped = this.groupByCategory(controls);

  return {
    categories: grouped,
    totalControls: controls.length,
    compliantCount: controls.filter(c => c.status === "Compliant").length,
    progressPercentage: this.calculateProgress(controls),
  };
}
```

Add section to report template:

```ejs
<!-- In report-pdf.ejs -->
<% if (sections.soc2) { %>
<div class="section" id="soc2">
  <h2>SOC 2 Controls</h2>
  <% sections.soc2.categories.forEach(category => { %>
    <h3><%= category.name %></h3>
    <table>
      <thead>
        <tr>
          <th>Control ID</th>
          <th>Title</th>
          <th>Status</th>
          <th>Owner</th>
        </tr>
      </thead>
      <tbody>
        <% category.controls.forEach(control => { %>
        <tr>
          <td><%= control.control_id %></td>
          <td><%= control.title %></td>
          <td><%= control.status %></td>
          <td><%= control.owner || '-' %></td>
        </tr>
        <% }); %>
      </tbody>
    </table>
  <% }); %>
</div>
<% } %>
```

## Step 9: Add to Section Selector

Update `GenerateReport/constants.ts`:

```typescript
// Add to REPORT_SECTION_GROUPS
{
  group: "Compliance & Governance",
  sections: [
    // ... existing sections
    {
      key: "soc2",
      label: "SOC 2 Controls",
      frameworks: [FRAMEWORK_IDS.SOC_2],
    },
  ],
},
```

## Step 10: Framework Auto-Creation

Add to `approvalRequest.utils.ts` for automatic framework creation on approval:

```typescript
// In createFrameworkRecords function
case 5: // SOC 2
  await createSOC2ControlsForProjectQuery(projectFrameworkId, organizationId, transaction);
  break;
```

## Checklist

- [ ] Database migration creates all required tables
- [ ] Seed data includes all framework content
- [ ] Backend models define schema correctly
- [ ] Utils handle all CRUD operations
- [ ] Routes and controllers are registered
- [ ] Frontend components display framework data
- [ ] Report generation includes new framework
- [ ] Section selector shows framework option
- [ ] Framework auto-creation works on approval
- [ ] Progress calculation is accurate
- [ ] Evidence linking works

## Related Documentation

- [Compliance Frameworks](../domains/compliance-frameworks.md)
- [Reporting](../domains/reporting.md)
- [Adding New Feature](./adding-new-feature.md)
