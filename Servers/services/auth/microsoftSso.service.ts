/**
 * Microsoft SSO login flow.
 *
 * Exchanges an OAuth authorization code for an access token via MSAL,
 * fetches the user profile from Microsoft Graph, and provisions /
 * resolves the matching local user.
 */

import { Transaction } from "sequelize";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { UserModel } from "../../domain.layer/models/user/user.model";
import {
  createNewUserQuery,
  getUserByEmailQuery,
  updateUserByIdQuery,
} from "../../utils/user.utils";
import { getAzureADConfigForLoginQuery } from "../../utils/ssoConfig.utils";

export const SSO_ROLE_MAP = new Map<string, number>([
  ["Admin", 1],
  ["Reviewer", 2],
  ["Editor", 3],
  ["Auditor", 4],
]);

const DEFAULT_SSO_ROLE = "Editor";

export interface MicrosoftSsoInput {
  code: string;
  organizationId: number;
  redirectUri: string;
}

export type MicrosoftSsoOutcome =
  | { ok: true; user: UserModel; roleName: string }
  | {
      ok: false;
      status: 400 | 401 | 403;
      message: string;
    };

interface MicrosoftUserProfile {
  id: string;
  mail?: string;
  userPrincipalName?: string;
  givenName?: string;
  surname?: string;
  displayName?: string;
}

/**
 * Run the full Microsoft SSO exchange and return the authenticated local user
 * (creating it on first login). Caller is responsible for the transaction,
 * token issuance, and HTTP response.
 */
export async function loginViaMicrosoftSso(
  input: MicrosoftSsoInput,
  transaction: Transaction,
): Promise<MicrosoftSsoOutcome> {
  const { code, organizationId, redirectUri } = input;
  const azureADConfig = await getAzureADConfigForLoginQuery(organizationId, transaction);

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: azureADConfig.client_id,
      authority: `https://login.microsoftonline.com/${azureADConfig.tenant_id}`,
      clientSecret: azureADConfig.client_secret,
    },
  });

  const tokenResponse = await cca.acquireTokenByCode({
    code,
    scopes: ["openid", "profile", "email", "User.Read"],
    redirectUri,
  });
  if (!tokenResponse) {
    return { ok: false, status: 401, message: "Failed to acquire token from Microsoft" };
  }

  const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
  });
  if (!userInfoResponse.ok) {
    return {
      ok: false,
      status: 401,
      message: "Failed to fetch user profile from Microsoft Graph",
    };
  }

  const userInfo = (await userInfoResponse.json()) as MicrosoftUserProfile;
  const email = userInfo.mail || userInfo.userPrincipalName;
  if (!email) {
    return {
      ok: false,
      status: 401,
      message: "Microsoft account did not return an email address",
    };
  }

  const roleClaim = ((tokenResponse.idTokenClaims as Record<string, any>)?.roles ?? [])[0] as
    | string
    | undefined;
  const roleName = roleClaim && SSO_ROLE_MAP.has(roleClaim) ? roleClaim : DEFAULT_SSO_ROLE;
  const roleId = SSO_ROLE_MAP.get(roleName)!;

  let user = (await getUserByEmailQuery(email)) as UserModel | undefined;

  if (!user) {
    const userModel = await UserModel.createNewUser(
      userInfo.givenName || userInfo.displayName || "User",
      userInfo.surname || userInfo.givenName || userInfo.displayName || "User",
      email,
      null,
      roleId,
      organizationId,
      "AzureAD",
      userInfo.id,
    );
    await userModel.validateUserData?.();
    user = await createNewUserQuery(userModel, transaction);
  } else if (user.organization_id !== organizationId) {
    return {
      ok: false,
      status: 403,
      message: "User does not belong to the selected organization",
    };
  } else if (user.role_id !== roleId) {
    await updateUserByIdQuery(user.id!, { role_id: roleId }, transaction);
    user.role_id = roleId;
  }

  return { ok: true, user: user!, roleName };
}
