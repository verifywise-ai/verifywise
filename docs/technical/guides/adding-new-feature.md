# Adding a New Feature

This guide walks through the process of adding a new feature to VerifyWise, covering both backend and frontend development with the established patterns.

## Overview

Adding a feature typically involves:
1. Database schema (if data persistence needed)
2. Backend model, interface, routes, controller, utils
3. Frontend types, repository, components, pages
4. Testing and validation

## Step 1: Database Migration

Create a migration file in `Servers/database/migrations/`:

```javascript
// 20260117000000-create-feature-table.js
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // All tables live in the verifywise schema (resolved via search_path).
    // Use unqualified table names — no schema prefix needed.
    await queryInterface.createTable("features", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "organizations", key: "id" },
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("Active", "Inactive"),
        defaultValue: "Active",
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("features");
  },
};
```

Run the migration:
```bash
cd Servers && npm run migrate
```

## Step 2: Backend Interface

Create interface in `Servers/domain.layer/interfaces/`:

```typescript
// i.feature.ts
export interface IFeature {
  id?: number;
  name: string;
  status: "Active" | "Inactive";
  created_at?: Date;
  updated_at?: Date;
}
```

## Step 3: Backend Model

Create model in `Servers/domain.layer/models/feature/`:

```typescript
// feature.model.ts
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from "sequelize-typescript";
import { IFeature } from "../../interfaces/i.feature";

@Table({
  tableName: "features",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
})
export class FeatureModel extends Model<IFeature> implements IFeature {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.ENUM("Active", "Inactive"),
    defaultValue: "Active",
  })
  status!: "Active" | "Inactive";

  @Column({
    type: DataType.DATE,
    field: "created_at",
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    field: "updated_at",
  })
  updated_at?: Date;

  toSafeJSON(): IFeature {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
```

## Step 4: Backend Utils (Query Functions)

Create utils in `Servers/utils/`:

```typescript
// feature.utils.ts
import { sequelize } from "../config/database";
import { QueryTypes, Transaction } from "sequelize";
import { IFeature } from "../domain.layer/interfaces/i.feature";
import { FeatureModel } from "../domain.layer/models/feature/feature.model";

export const getAllFeaturesQuery = async (
  organizationId: number
): Promise<FeatureModel[]> => {
  const query = `
    SELECT * FROM features
    WHERE organization_id = :organizationId
    ORDER BY created_at DESC
  `;
  return sequelize.query(query, {
    type: QueryTypes.SELECT,
    model: FeatureModel,
    mapToModel: true,
    replacements: { organizationId },
  });
};

export const getFeatureByIdQuery = async (
  id: number,
  organizationId: number
): Promise<FeatureModel | null> => {
  const query = `
    SELECT * FROM features
    WHERE id = :id AND organization_id = :organizationId
  `;
  const results = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    model: FeatureModel,
    mapToModel: true,
    replacements: { id, organizationId },
  });
  return results[0] || null;
};

export const createFeatureQuery = async (
  feature: IFeature,
  organizationId: number,
  transaction?: Transaction
): Promise<FeatureModel> => {
  const query = `
    INSERT INTO features (organization_id, name, status, created_at, updated_at)
    VALUES (:organizationId, :name, :status, NOW(), NOW())
    RETURNING *
  `;
  const [result] = await sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements: {
      organizationId,
      name: feature.name,
      status: feature.status || "Active",
    },
    transaction,
  });
  return result[0] as FeatureModel;
};

export const updateFeatureQuery = async (
  id: number,
  feature: Partial<IFeature>,
  organizationId: number,
  transaction?: Transaction
): Promise<FeatureModel | null> => {
  const setClauses: string[] = [];
  const replacements: Record<string, any> = { id, organizationId };

  if (feature.name !== undefined) {
    setClauses.push("name = :name");
    replacements.name = feature.name;
  }
  if (feature.status !== undefined) {
    setClauses.push("status = :status");
    replacements.status = feature.status;
  }
  setClauses.push("updated_at = NOW()");

  const query = `
    UPDATE features
    SET ${setClauses.join(", ")}
    WHERE id = :id AND organization_id = :organizationId
    RETURNING *
  `;
  const [result] = await sequelize.query(query, {
    type: QueryTypes.UPDATE,
    replacements,
    transaction,
  });
  return (result[0] as FeatureModel) || null;
};

export const deleteFeatureQuery = async (
  id: number,
  organizationId: number,
  transaction?: Transaction
): Promise<boolean> => {
  const query = `
    DELETE FROM features
    WHERE id = :id AND organization_id = :organizationId
  `;
  await sequelize.query(query, {
    type: QueryTypes.DELETE,
    replacements: { id, organizationId },
    transaction,
  });
  return true;
};
```

## Step 5: Backend Controller

Create controller in `Servers/controllers/`:

```typescript
// feature.ctrl.ts
import { Request, Response } from "express";
import { sequelize } from "../config/database";
import {
  getAllFeaturesQuery,
  getFeatureByIdQuery,
  createFeatureQuery,
  updateFeatureQuery,
  deleteFeatureQuery,
} from "../utils/feature.utils";

export const getAllFeatures = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const organizationId = req.organizationId;
    const features = await getAllFeaturesQuery(organizationId);

    if (!features.length) {
      return res.status(204).json([]);
    }

    return res.status(200).json(features.map((f) => f.toSafeJSON()));
  } catch (error) {
    console.error("Error fetching features:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getFeatureById = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId;

    if (!Number.isSafeInteger(Number(id))) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const feature = await getFeatureByIdQuery(Number(id), organizationId);

    if (!feature) {
      return res.status(404).json({ message: "Feature not found" });
    }

    return res.status(200).json(feature.toSafeJSON());
  } catch (error) {
    console.error("Error fetching feature:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createFeature = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    const organizationId = req.organizationId;
    const featureData = req.body;

    const feature = await createFeatureQuery(featureData, organizationId, transaction);

    await transaction.commit();
    return res.status(201).json(feature);
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating feature:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateFeature = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const organizationId = req.organizationId;
    const updateData = req.body;

    if (!Number.isSafeInteger(Number(id))) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const feature = await updateFeatureQuery(
      Number(id),
      updateData,
      organizationId,
      transaction
    );

    if (!feature) {
      await transaction.rollback();
      return res.status(404).json({ message: "Feature not found" });
    }

    await transaction.commit();
    return res.status(202).json(feature);
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating feature:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteFeature = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const organizationId = req.organizationId;

    if (!Number.isSafeInteger(Number(id))) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    await deleteFeatureQuery(Number(id), organizationId, transaction);

    await transaction.commit();
    return res.status(202).json({ message: "Feature deleted" });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting feature:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
```

## Step 6: Backend Routes

Create routes in `Servers/routes/`:

```typescript
// feature.route.ts
import express from "express";
import { authenticateJWT } from "../middleware/auth.middleware";
import {
  getAllFeatures,
  getFeatureById,
  createFeature,
  updateFeature,
  deleteFeature,
} from "../controllers/feature.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, getAllFeatures);
router.get("/:id", authenticateJWT, getFeatureById);
router.post("/", authenticateJWT, createFeature);
router.patch("/:id", authenticateJWT, updateFeature);
router.delete("/:id", authenticateJWT, deleteFeature);

export default router;
```

Register the routes in `Servers/routes/index.ts`:

```typescript
import featureRoutes from "./feature.route";

// Add to router registration
router.use("/features", featureRoutes);
```

## Step 7: Frontend Types

Create types in `Clients/src/domain/`:

```typescript
// types/Feature.ts
export interface Feature {
  id?: number;
  name: string;
  status: "Active" | "Inactive";
  created_at?: string;
  updated_at?: string;
}

export interface FeatureFormData {
  name: string;
  status: "Active" | "Inactive";
}
```

## Step 8: Frontend Repository

Create repository in `Clients/src/application/repository/`:

```typescript
// feature.repository.ts
import { apiServices } from "../../infrastructure/api/networkServices";
import { Feature, FeatureFormData } from "../../domain/types/Feature";

const BASE_URL = "/features";

export const featureRepository = {
  getAll: async (): Promise<Feature[]> => {
    const response = await apiServices.get(BASE_URL);
    return response.data;
  },

  getById: async (id: number): Promise<Feature> => {
    const response = await apiServices.get(`${BASE_URL}/${id}`);
    return response.data;
  },

  create: async (data: FeatureFormData): Promise<Feature> => {
    const response = await apiServices.post(BASE_URL, data);
    return response.data;
  },

  update: async (id: number, data: Partial<FeatureFormData>): Promise<Feature> => {
    const response = await apiServices.patch(`${BASE_URL}/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiServices.delete(`${BASE_URL}/${id}`);
  },
};
```

## Step 9: Frontend Custom Hook

Create hook in `Clients/src/application/hooks/`:

```typescript
// useFeatures.ts
import { useState, useEffect, useCallback } from "react";
import { Feature } from "../../domain/types/Feature";
import { featureRepository } from "../repository/feature.repository";

export const useFeatures = () => {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = useCallback(async () => {
    try {
      setLoading(true);
      const data = await featureRepository.getAll();
      setFeatures(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch features");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  return { features, loading, error, refetch: fetchFeatures };
};
```

## Step 10: Frontend Page

Create page in `Clients/src/presentation/pages/`:

```typescript
// Features/index.tsx
import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useFeatures } from "../../../application/hooks/useFeatures";
import { FeatureTable } from "./FeatureTable";
import { FeatureModal } from "./FeatureModal";
import { Feature } from "../../../domain/types/Feature";

export const FeaturesPage = () => {
  const { features, loading, refetch } = useFeatures();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

  const handleEdit = (feature: Feature) => {
    setSelectedFeature(feature);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedFeature(null);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setSelectedFeature(null);
  };

  const handleSuccess = () => {
    handleClose();
    refetch();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h5">Features</Typography>
        <Button variant="contained" onClick={handleCreate}>
          Add feature
        </Button>
      </Box>

      <FeatureTable
        features={features}
        loading={loading}
        onEdit={handleEdit}
        onDelete={refetch}
      />

      <FeatureModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onSuccess={handleSuccess}
        feature={selectedFeature}
      />
    </Box>
  );
};
```

## Step 11: Register Route

Add route in `Clients/src/App.tsx` or routes configuration:

```typescript
import { FeaturesPage } from "./presentation/pages/Features";

// In routes array
{
  path: "/features",
  element: <FeaturesPage />,
}
```

## Step 12: Add Navigation

Add to sidebar in `Clients/src/presentation/components/Sidebar/`:

```typescript
{
  label: "Features",
  icon: FeaturesIcon,
  path: "/features",
}
```

## Checklist

Before submitting your feature:

- [ ] Migration creates table in the verifywise schema with `organization_id` column
- [ ] Model uses `toSafeJSON()` for API responses
- [ ] Controller uses transactions for create/update/delete
- [ ] Routes are protected with `authenticateJWT`
- [ ] Frontend types match backend interface
- [ ] Repository handles all CRUD operations
- [ ] Components follow existing patterns
- [ ] No TypeScript errors
- [ ] No unused imports or variables
- [ ] Route registered and accessible

## Related Documentation

- [API Conventions](./api-conventions.md)
- [Database Schema](../architecture/database-schema.md)
- [Frontend Overview](../frontend/overview.md)
