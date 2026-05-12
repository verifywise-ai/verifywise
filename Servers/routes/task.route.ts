import express from "express";
const router = express.Router();

import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  restoreTask,
  hardDeleteTask,
  bulkUpdateTasks,
} from "../controllers/task.ctrl";

import {
  addTaskEntityLink,
  getTaskEntityLinks,
  removeTaskEntityLink,
} from "../controllers/taskEntityLink.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// GET requests
router.get("/", authenticateJWT, getAllTasks);
router.get("/:id", authenticateJWT, getTaskById);
router.get("/:id/entities", authenticateJWT, getTaskEntityLinks);

// POST requests
router.post("/", authenticateJWT, createTask);
router.post("/:id/entities", authenticateJWT, addTaskEntityLink);

// PATCH requests
// Note: More specific routes must come before generic /:id routes
router.patch("/bulk", authenticateJWT, authorize(["Admin", "Editor"]), bulkUpdateTasks);

// PUT requests
// Note: More specific routes must come before generic /:id routes
router.put("/:id/restore", authenticateJWT, restoreTask);
router.put("/:id", authenticateJWT, updateTask);

// DELETE requests
// Note: More specific routes must come before generic /:id routes
router.delete("/:id/hard", authenticateJWT, hardDeleteTask);
router.delete("/:id/entities/:linkId", authenticateJWT, removeTaskEntityLink);
router.delete("/:id", authenticateJWT, deleteTask);

export default router;
