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
// Profile photos: small images only (prevents memory-exhaustion DoS via
// unbounded multipart uploads).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: any) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
  },
});

import rateLimit from "express-rate-limit";
import {
  authLimiter,
  isNonProduction,
  tokenRefreshLimiter,
} from "../middleware/rateLimit.middleware";

import {
  checkUserExists,
  createNewUser,
  deleteUserById,
  getAllUsers,
  getUserById,
  getPreferencesForCurrentUser,
  patchPreferencesForCurrentUser,
  loginUser,
  loginUserWithMicrosoft,
  updateUserById,
  calculateProgress,
  ChangePassword,
  refreshAccessToken,
  uploadUserProfilePhoto,
  getUserProfilePhoto,
  deleteUserProfilePhoto,
  resetPassword,
  logoutUser,
} from "../controllers/user.ctrl";
import resetPasswordMiddleware from "../middleware/resetPassword.middleware";
import authenticateJWT from "../middleware/auth.middleware";
import registerJWT from "../middleware/register.middleware";
import { selfOnly } from "../middleware/selfOnly.middleware";
import authorize from "../middleware/accessControl.middleware";

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
router.get("/preferences", authenticateJWT, getPreferencesForCurrentUser);

/**
 * GET /users/me/preferences
 *
 * Returns the authenticated user's persisted date_format and language.
 * Alias of GET /users/preferences; preferred self-scoped path.
 */
router.get("/me/preferences", authenticateJWT, getPreferencesForCurrentUser);

/**
 * PATCH /users/me/preferences
 *
 * Upserts the authenticated user's date_format and/or language.
 * Body user_id is ignored; the JWT user is always the target.
 */
router.patch("/me/preferences", authenticateJWT, patchPreferencesForCurrentUser);

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
// Apply rate limiting specifically to login route. Relaxed in explicit
// dev/test so a single localhost IP running repeated E2E logins is not
// locked out; production keeps the strict 5/min ceiling.
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  // Relaxed in explicit dev/test so the E2E suite's repeated UI logins are not
  // blocked; strict 5/min production limit unchanged (see rateLimit.middleware).
  max: isNonProduction ? 1000 : 5, // limit each IP to N login requests per windowMs
  message: "Too many login attempts from this IP, please try again after a minute",
});
router.post("/login", loginLimiter, loginUser);
router.post("/login-microsoft", loginLimiter, loginUserWithMicrosoft);

router.post("/refresh-token", tokenRefreshLimiter, refreshAccessToken);

/**
 * POST /users/logout
 *
 * Revokes the presented refresh token server-side and clears the cookie.
 * No JWT required: the access token may already be expired, and the
 * endpoint only revokes the token presented in the cookie.
 */
router.post("/logout", logoutUser);

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
router.delete("/:id", authenticateJWT, authorize(["Admin", "SuperAdmin"]), deleteUserById);

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
