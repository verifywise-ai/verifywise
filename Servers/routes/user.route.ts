/**
 * @fileoverview User Management Routes
 *
 * Defines RESTful API endpoints for user management, authentication, and account operations.
 * All routes except login, registration, and token refresh require JWT authentication.
 *
 * Authentication Endpoints:
 * - POST /login - User authentication with email/password
 * - POST /refresh-token - Obtain new access token using refresh token
 * - POST /check-user-exists - Check if any user exists (setup flow)
 *
 * User CRUD Endpoints:
 * - GET / - List all users in organization (authenticated)
 * - GET /by-email/:email - Get user by email (authenticated)
 * - GET /:id - Get user by ID (authenticated)
 * - POST / - Create new user (authenticated)
 * - PUT /:id - Update user by ID (authenticated)
 * - DELETE /:id - Delete user by ID (authenticated)
 *
 * Password Management:
 * - POST /reset-password - Reset user password
 * - POST /change-password - Change password (authenticated)
 *
 * User Analytics:
 * - GET /:id/progress - Calculate user's project progress (authenticated)
 *
 * @module routes/user.route
 */

import express from "express";
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

import rateLimit from "express-rate-limit";
import { authLimiter } from "../middleware/rateLimit.middleware";

import {
  checkUserExists,
  createNewUser,
  deleteUserById,
  getAllUsers,
  getUserById,
  loginUser,
  updateUserById,
  calculateProgress,
  ChangePassword,
  refreshAccessToken,
  uploadUserProfilePhoto,
  getUserProfilePhoto,
  deleteUserProfilePhoto,
  resetPassword,
} from "../controllers/user.ctrl";
import resetPasswordMiddleware from "../middleware/resetPassword.middleware";
import authenticateJWT from "../middleware/auth.middleware";
import registerJWT from "../middleware/register.middleware";
import { selfOnly } from "../middleware/selfOnly.middleware";

/**
 * GET /users
 *
 * Retrieves a list of all users.
 *
 * @name get/
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.get("/", authenticateJWT, getAllUsers);

/**
 * GET /users/by-email/:email
 *
 * Retrieves a user by their email address.
 *
 * @name get/by-email/:email
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
// router.get("/by-email/:email", getUserByEmail);

/**
 * GET /users/:id
 *
 * Retrieves a user by their ID.
 *
 * @name get/:id
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.get("/:id", authenticateJWT, getUserById);

/**
 * POST /users/register
 *
 * Creates a new user.
 *
 * @name post/register
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.post("/register", authLimiter, registerJWT, createNewUser);

/**
 * POST /users/login
 *
 * Authenticates a user and returns a token.
 *
 * @name post/login
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
// Apply rate limiting specifically to login route
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 login requests per windowMs
  message: "Too many login attempts from this IP, please try again after a minute",
});
router.post("/login", loginLimiter, loginUser);

router.post("/refresh-token", authLimiter, refreshAccessToken);

/**
 * POST /users/reset-password
 *
 * Resets a user's password.
 *
 * @name post/reset-password
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.post("/reset-password", authLimiter, resetPasswordMiddleware, resetPassword);

/**
 * PATCH /users/chng-pass/:id
 *
 * Changes a user's password.
 *
 * @name patch/chng-pass/:id
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.patch("/chng-pass/:id", authLimiter, authenticateJWT, selfOnly, ChangePassword);

/**
 * PATCH /users/:id
 *
 * Updates a user's information by their ID.
 *
 * @name patch/:id
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.patch("/:id", authenticateJWT, updateUserById);

/**
 * DELETE /users/:id
 *
 * Deletes a user by their ID.
 *
 * @name delete/:id
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.delete("/:id", authenticateJWT, deleteUserById);

/**
 * GET /users/check-user-exists
 *
 * Checks if any user exists in the database.
 *
 * @name get/check-user-exists
 * @function
 * @memberof module:routes/user.route
 * @inner
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 */
router.get("/check/exists", authenticateJWT, checkUserExists);

router.get("/:id/calculate-progress", authenticateJWT, calculateProgress);

/**
 * Profile Photo Routes
 */
router.post("/:id/profile-photo", authenticateJWT, upload.single("photo"), uploadUserProfilePhoto);
router.get("/:id/profile-photo", authenticateJWT, getUserProfilePhoto);
router.delete("/:id/profile-photo", authenticateJWT, deleteUserProfilePhoto);

export default router;

/** 
Code snippet for using emailService to send emails here

import express from 'express';
import { sendWelcomeEmail } from '../services/emailService';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, name } = req.body;

  try {
    await sendWelcomeEmail(email, name);
    res.status(200).send('Registration successful and welcome email sent.');
  } catch (error) {
    res.status(500).send('Error sending welcome email.');
  }
});

export default router; 
*/
