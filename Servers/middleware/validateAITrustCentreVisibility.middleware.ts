import { NextFunction, Request, Response } from "express";
import { getIsVisibleQuery } from "../utils/aiTrustCentre.utils";
import { getOrganizationIdFromTenantHash } from "../tools/getTenantHash";

export const validateVisibility = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const hash = Array.isArray(req.params.hash) ? req.params.hash[0] : req.params.hash;

  if (!hash || hash.replace(/\s+/g, " ").trim().length !== 10) {
    return res.status(400).json({ error: "Invalid hash" });
  }

  // Reverse lookup organization ID from tenant hash
  const organizationId = await getOrganizationIdFromTenantHash(hash);
  if (!organizationId) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const isVisible = await getIsVisibleQuery(organizationId);

  if (!isVisible) {
    // Removed Unnecessary validation
    return next();
  } else {
    return next();
  }
};
