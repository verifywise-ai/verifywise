/**
 * @file tiers.util.ts
 * @description This file contains utility functions for performing CRUD operations on the 'tiers' table in the database.
 *
 * The functions included are:
 * - `getAllTiersQuery`: Fetches all tiers from the database, ordered by ID in ascending order.
 * - `getTiersFeaturesQuery`: Fetches features of a specific tier by its ID.
 *
 * Each function interacts with the database using SQL queries and returns the result.
 * The functions support database transactions for data consistency and integrity.
 *
 * @module utils/tiers.util
 */

import { TiersModel } from "../domain.layer/models/tiers/tiers.model";
import { TierFeatures } from "../domain.layer/interfaces/i.tiers";
import { sequelize } from "../database/db";
import { Transaction } from "sequelize";

export const getAllTiersQuery = async (): Promise<TiersModel[]> => {
  const tiers = await sequelize.query(`SELECT * FROM tiers ORDER BY id ASC`, {
    mapToModel: true,
    model: TiersModel,
  });
  return tiers;
};

export const getTiersFeaturesQuery = async (id: number): Promise<TierFeatures> => {
  const tiersFeatures = await sequelize.query(`SELECT * FROM tiers WHERE id = :id`, {
    replacements: { id },
    mapToModel: true,
    model: TiersModel,
  });
  return tiersFeatures[0].dataValues.features;
};

export const createTiersQuery = async (
  tier: Partial<TiersModel>,
  transaction: Transaction,
): Promise<TiersModel> => {
  const result = await sequelize.query(
    `INSERT INTO tiers (name, price, features, created_at) VALUES (:name, :price, :features, :created_at) RETURNING *`,
    {
      replacements: {
        name: tier.name,
        price: tier.price,
        features: JSON.stringify(tier.features),
        created_at: new Date(),
      },
      mapToModel: true,
      model: TiersModel,
      transaction,
    },
  );
  return result[0];
};

export const updateTiersQuery = async (
  id: number,
  tier: Partial<TiersModel>,
  transaction: Transaction,
): Promise<TiersModel> => {
  const result = await sequelize.query(
    `UPDATE tiers SET name = :name, price = :price, features = :features, updated_at = :updated_at WHERE id = :id RETURNING *`,
    {
      replacements: {
        id,
        name: tier.name,
        price: tier.price,
        features: JSON.stringify(tier.features),
        updated_at: new Date(),
      },
      mapToModel: true,
      model: TiersModel,
      transaction,
    },
  );
  return result[0];
};

export const deleteTiersQuery = async (id: number, transaction: Transaction): Promise<void> => {
  await sequelize.query(`DELETE FROM tiers WHERE id = :id`, {
    replacements: { id },
    mapToModel: true,
    model: TiersModel,
    transaction,
  });
};
