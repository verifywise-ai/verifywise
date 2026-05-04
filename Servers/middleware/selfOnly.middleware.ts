/**
 * @fileoverview Self-Only Access Middleware
 *
 * Ensures users can only perform operations on their own data.
 * Prevents IDOR (Insecure Direct Object Reference) vulnerabilities
 * by verifying the authenticated user's ID matches the target resource ID.
 *
 * @module middleware/selfOnly
 */

import { Request, Response, NextFunction } from "express";

/**
 * Middleware to ensure users can only operate on their own data
 *
 * Compares the authenticated user's ID (from JWT via req.userId)
 * with the target ID from request params or body.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void | Response} Continues to next middleware or returns 403 error
 *
 * @example
 * // Protect password change endpoint
 * router.patch("/chng-pass/:id", authenticateJWT, selfOnly, ChangePassword);
 *
 * @example
 * // Protect profile update endpoint
 * router.patch("/profile/:id", authenticateJWT, selfOnly, updateProfile);
 */
export const selfOnly = (req: Request, res: Response, next: NextFunction): void | Response => {
  const jwtUserId = req.userId;
  const paramsId = req.params.id;
  const bodyId = req.body.id;

  if (!jwtUserId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // At least one target ID must be provided
  if (!paramsId && !bodyId) {
    return res.status(400).json({ message: "Target user ID is required" });
  }

  // Check all provided IDs match the JWT user ID
  const jwtIdStr = String(jwtUserId);

  if (paramsId && String(paramsId) !== jwtIdStr) {
    return res.status(403).json({
      message: "You can only modify your own data",
    });
  }

  if (bodyId && String(bodyId) !== jwtIdStr) {
    return res.status(403).json({
      message: "You can only modify your own data",
    });
  }

  // Also ensure params and body IDs match each other if both provided
  if (paramsId && bodyId && String(paramsId) !== String(bodyId)) {
    return res.status(400).json({
      message: "Mismatched user IDs in request",
    });
  }

  next();
};
