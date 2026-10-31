import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { AzureADConfigData, SSOProvider } from "../domain.layer/interfaces/i.ssoConfig";
import { SSOConfigurationModel } from "../domain.layer/models/ssoConfig/ssoConfig.model";
import { encryptSecret, decryptSecret } from "./secretEncryption.utils";

export const isSSOFeatureEnabled = (): boolean =>
  (process.env.SSO_ENABLED ?? "").trim().toLowerCase() === "true";

export const getSSOConfigQuery = async (
  organization_id: number,
  provider: SSOProvider,
): Promise<SSOConfigurationModel | undefined> => {
  const result = (await sequelize.query(
    `SELECT * FROM sso_configurations
       WHERE organization_id = :organization_id AND provider = :provider
       LIMIT 1`,
    { replacements: { organization_id, provider } },
  )) as [SSOConfigurationModel[], number];
  return result[0][0];
};

export const getFirstEnabledSSOConfigQuery = async (
  provider: SSOProvider,
): Promise<SSOConfigurationModel | undefined> => {
  const result = (await sequelize.query(
    `SELECT * FROM sso_configurations
       WHERE provider = :provider AND is_enabled = TRUE
       ORDER BY id ASC LIMIT 1`,
    { replacements: { provider } },
  )) as [SSOConfigurationModel[], number];
  return result[0][0];
};

export const getSSOCapableOrganizationsQuery = async (
  provider: SSOProvider,
): Promise<Array<{ id: number; name: string; ssoEnabled: boolean }>> => {
  const result = (await sequelize.query(
    `SELECT o.id, o.name, COALESCE(s.is_enabled, FALSE) AS sso_enabled
       FROM organizations o
       LEFT JOIN sso_configurations s
         ON s.organization_id = o.id AND s.provider = :provider
       ORDER BY o.name ASC`,
    { replacements: { provider } },
  )) as [Array<{ id: number; name: string; sso_enabled: boolean }>, number];
  return result[0].map((r) => ({ id: r.id, name: r.name, ssoEnabled: !!r.sso_enabled }));
};

export const getAzureADConfigForLoginQuery = async (
  organization_id: number,
  transaction: Transaction | null = null,
): Promise<AzureADConfigData> => {
  const result = (await sequelize.query(
    `SELECT config_data FROM sso_configurations
       WHERE organization_id = :organization_id AND provider = 'AzureAD' AND is_enabled = TRUE
       LIMIT 1`,
    {
      replacements: { organization_id },
      ...(transaction ? { transaction } : {}),
    },
  )) as [{ config_data: AzureADConfigData }[], number];
  if (result[0].length === 0) {
    throw new Error("Azure AD SSO is not enabled for this organization");
  }
  const stored = result[0][0].config_data;
  return {
    ...stored,
    client_secret: decryptSecret(stored.client_secret),
  };
};

export const saveSSOConfigQuery = async (
  organization_id: number,
  provider: SSOProvider,
  ssoConfigData: AzureADConfigData,
): Promise<SSOConfigurationModel> => {
  if (provider !== "AzureAD") {
    throw new Error("Unsupported SSO provider");
  }
  const encryptedConfig: AzureADConfigData = {
    ...ssoConfigData,
    client_secret: encryptSecret(ssoConfigData.client_secret),
  };

  const result = (await sequelize.query(
    `INSERT INTO sso_configurations (organization_id, provider, config_data, created_at, updated_at)
       VALUES (:organization_id, :provider, :config_data, NOW(), NOW())
       ON CONFLICT (organization_id, provider)
       DO UPDATE SET config_data = EXCLUDED.config_data, updated_at = NOW()
       RETURNING *`,
    {
      replacements: {
        organization_id,
        provider,
        config_data: JSON.stringify(encryptedConfig),
      },
    },
  )) as [SSOConfigurationModel[], number];
  return result[0][0];
};

export const setSSOEnabledQuery = async (
  organization_id: number,
  provider: SSOProvider,
  is_enabled: boolean,
): Promise<void> => {
  const result = (await sequelize.query(
    `UPDATE sso_configurations
       SET is_enabled = :is_enabled, updated_at = NOW()
       WHERE organization_id = :organization_id AND provider = :provider
       RETURNING id`,
    { replacements: { organization_id, provider, is_enabled } },
  )) as [{ id: number }[], number];
  if (result[0].length === 0) {
    throw new Error("SSO configuration not found for this organization and provider");
  }
};
