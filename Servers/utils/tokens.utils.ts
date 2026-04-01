import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { IToken } from "../domain.layer/interfaces/i.tokens";
import { TokenModel } from "../domain.layer/models/tokens/tokens.model";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

export const getNumberOfApiTokensQuery = async (
  organizationId: number,
) => {
  const numberOfTokens = await sequelize.query(
    `SELECT COUNT(*) FROM api_tokens WHERE organization_id = :organizationId;`,
    { replacements: { organizationId } }
  ) as [{ count: string }[], number];
  return parseInt(numberOfTokens[0][0].count, 10);
}

export const createApiTokenQuery = async (
  tokenPayload: IToken,
  organizationId: number,
  transaction: Transaction
) => {
  // Check if a token with this name already exists
  const existingToken = await sequelize.query(
    `SELECT id FROM api_tokens WHERE organization_id = :organizationId AND name = :name;`,
    {
      replacements: { organizationId, name: tokenPayload.name },
      transaction
    }
  ) as [{ id: number }[], number];

  if (existingToken[0].length > 0) {
    throw new ValidationException("A token with this name already exists. Please use a different name.");
  }

  const result = await sequelize.query(
    `INSERT INTO api_tokens (
      organization_id, token, name, expires_at, created_by
    ) VALUES (
      :organizationId, :token, :name, :expires_at, :created_by
    ) RETURNING *;`, {
    replacements: {
      organizationId,
      token: tokenPayload.token,
      name: tokenPayload.name,
      expires_at: tokenPayload.expires_at,
      created_by: tokenPayload.created_by,
    },
    transaction
  }) as [IToken[], number];
  return result[0][0];
}

export const getApiTokensQuery = async (
  organizationId: number
) => {
  const result = await sequelize.query(
    `SELECT id, name, expires_at, created_by, created_at FROM api_tokens WHERE organization_id = :organizationId ORDER BY created_at DESC;`,
    { replacements: { organizationId } }
  ) as [TokenModel[], number];
  return result[0];
}

export const deleteApiTokenQuery = async (
  id: number,
  organizationId: number
) => {
  const result = await sequelize.query(
    `DELETE FROM api_tokens WHERE organization_id = :organizationId AND id = :id RETURNING *;`, {
    replacements: { organizationId, id },
    mapToModel: true,
    model: TokenModel,
    type: QueryTypes.DELETE
  });
  return result.length > 0;
}