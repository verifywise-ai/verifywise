import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  addGroupMembers,
  createGroup,
  deleteGroupById,
  getGroupById,
  listGroupMembers,
  listGroups,
  listProjectGroups,
  removeGroupMember,
  setGroupMembers,
  setProjectGroups,
  updateGroupById,
} from "../../controllers/group.ctrl";

const router = express.Router();

// Groups / teams with RBAC (#5253, VW-CQ-01). Reads are available to every
// authenticated user (the pickers need them); writes need groups.manage.
router.get("/", authenticateJWT, listGroups);
router.get("/:id", authenticateJWT, getGroupById);
router.post("/", authenticateJWT, authorize("groups.manage"), createGroup);
router.patch("/:id", authenticateJWT, authorize("groups.manage"), updateGroupById);
router.delete("/:id", authenticateJWT, authorize("groups.manage"), deleteGroupById);

router.get("/:id/members", authenticateJWT, listGroupMembers);
router.post("/:id/members", authenticateJWT, authorize("groups.manage"), addGroupMembers);
router.put("/:id/members", authenticateJWT, authorize("groups.manage"), setGroupMembers);
router.delete(
  "/:id/members/:userId",
  authenticateJWT,
  authorize("groups.manage"),
  removeGroupMember,
);

// Group access to a use case, resolved at check time by
// utils/projectVisibility.utils.ts.
router.get("/projects/:projectId/groups", authenticateJWT, listProjectGroups);
router.put(
  "/projects/:projectId/groups",
  authenticateJWT,
  authorize("useCase.edit"),
  setProjectGroups,
);

export default router;
