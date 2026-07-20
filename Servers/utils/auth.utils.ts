import crypto from "crypto";
import { Response } from "express";
import { generateToken, generateRefreshToken, THIRTY_DAYS_MS } from "./jwt.utils";
import { storeRefreshToken } from "./refreshToken.utils";

export interface UserTokenData {
  id: number;
  email: string;
  roleName: string;
  organizationId: number | null;
}

export interface AuthTokenResult {
  accessToken: string;
  refreshToken: string;
  /** Rotation family the refresh token belongs to. */
  familyId: string;
}

/**
 * Generates access and refresh tokens, persists the refresh token hash,
 * and sets the refresh token cookie.
 *
 * Token payload includes organizationId for tenant isolation.
 * With shared-schema multi-tenancy, we use organization_id directly
 * in database queries instead of tenant hash schemas.
 *
 * Pass `familyId` when rotating an existing session so reuse detection
 * can revoke the whole family on theft; omit it to start a new family
 * (fresh login).
 *
 * @param userData - User data for token generation
 * @param res - Express response object for setting cookies
 * @param familyId - Optional existing rotation family id
 * @returns Object containing both tokens and the family id
 */
export async function generateUserTokens(
  userData: UserTokenData,
  res: Response,
  familyId?: string,
): Promise<AuthTokenResult> {
  const tokenPayload = {
    id: userData.id,
    email: userData.email,
    roleName: userData.roleName,
    organizationId: userData.organizationId,
  };

  const accessToken = generateToken(tokenPayload) as string;
  const refreshToken = generateRefreshToken(tokenPayload) as string;
  const family = familyId ?? crypto.randomUUID();
  const refreshExpiresAt = new Date(Date.now() + THIRTY_DAYS_MS);

  // Persist the token hash so refresh/logout/reuse-detection can verify it.
  await storeRefreshToken({
    userId: userData.id,
    organizationId: userData.organizationId,
    token: refreshToken,
    familyId: family,
    expiresAt: refreshExpiresAt,
  });

  // Set refresh token as httpOnly cookie
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    path: "/api/users",
    expires: refreshExpiresAt, // 30 days
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  return {
    accessToken,
    refreshToken,
    familyId: family,
  };
}
