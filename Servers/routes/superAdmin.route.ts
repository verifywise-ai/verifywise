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

export default router;
