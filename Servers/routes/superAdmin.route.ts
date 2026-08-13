import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import superAdminOnly from "../middleware/superAdminOnly.middleware";
import {
  listOrganizations,
  createOrg,
  deleteOrg,
  updateOrg,
  getUserCount,
  listAllUsers,
  listOrgUsers,
  inviteUserToOrg,
  updateUser,
  removeUser,
  getMonitoring,
  updateMonitoring,
  generateMonitoringToken,
  listSuperAdmins,
  grantSuperAdmin,
  revokeSuperAdmin,
} from "../controllers/superAdmin.ctrl";

const router = express.Router();

// All routes require authentication + super-admin role
router.use(authenticateJWT, superAdminOnly);

router.get("/organizations", listOrganizations);
router.post("/organizations", createOrg);
router.delete("/organizations/:id", deleteOrg);
router.patch("/organizations/:id", updateOrg);
router.get("/users/count", getUserCount);
router.get("/users", listAllUsers);
router.get("/organizations/:id/users", listOrgUsers);
router.post("/organizations/:id/invite", inviteUserToOrg);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", removeUser);

// Observability / monitoring configuration (instance-level)
router.get("/monitoring", getMonitoring);
router.put("/monitoring", updateMonitoring);
router.post("/monitoring/token", generateMonitoringToken);

// SuperAdmin membership: list current SuperAdmins, elect a user, revoke.
router.get("/super-admins", listSuperAdmins);
router.post("/super-admins", grantSuperAdmin);
router.delete("/super-admins/:user_id", revokeSuperAdmin);

export default router;
