import { Response } from "express";
import { generateToken, generateRefreshToken } from "./jwt.utils";

export interface UserTokenData {
  id: number;
  email: string;
  roleName: string;
  organizationId: number | null;
}

export interface AuthTokenResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generates access and refresh tokens and sets refresh token cookie
 *
 * Token payload includes organizationId for tenant isolation.
 * With shared-schema multi-tenancy, we use organization_id directly
 * in database queries instead of tenant hash schemas.
 *
 * @param userData - User data for token generation
 * @param res - Express response object for setting cookies
 * @returns Object containing both tokens
 */
export function generateUserTokens(
  userData: UserTokenData,
  res: Response
): AuthTokenResult {
  const tokenPayload = {
    id: userData.id,
    email: userData.email,
    roleName: userData.roleName,
    organizationId: userData.organizationId,
  };

  const accessToken = generateToken(tokenPayload) as string;
  const refreshToken = generateRefreshToken(tokenPayload) as string;

  // Set refresh token as httpOnly cookie
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    path: '/api/users',
    expires: new Date(Date.now() + 1 * 3600 * 1000 * 24 * 30), // 30 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  return {
    accessToken,
    refreshToken,
  };
}