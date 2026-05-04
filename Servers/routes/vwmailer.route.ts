import express, { Request, Response } from "express";
import { sendEmail } from "../services/emailService";
import fs from "fs";
import path from "path";
import { generateInviteToken } from "../utils/jwt.utils";
import { frontEndUrl } from "../config/constants";
import { invite } from "../controllers/vwmailer.ctrl";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import rateLimit from "express-rate-limit";
import { getUserByEmailQuery } from "../utils/user.utils";
import authenticateJWT from "../middleware/auth.middleware";

const router = express.Router();

// Rate limiter: max 5 requests per minute per IP for password reset
const resetPasswordLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: "Too many password reset requests from this IP, please try again later.",
  },
});

// Rate limiter: max 5 requests per minute per IP for invite route
const inviteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: "Too many invite requests from this IP, please try again later.",
  },
});

router.post("/invite", authenticateJWT, inviteLimiter, async (req, res) => {
  await invite(req, res, req.body);
});

router.post("/reset-password", resetPasswordLimiter, async (req: Request, res: Response) => {
  const { to, name, email } = req.body;

  logProcessing({
    description: `starting password reset request for: ${to}`,
    functionName: "reset-password",
    fileName: "vwmailer.route.ts",
    userId: req.userId!,
    tenantId: req.tenantId!,
  });

  try {
    // Check if user exists in the database
    const userData = await getUserByEmailQuery(to);

    // Only send email if user exists
    if (userData) {
      // Read the MJML template file
      const templatePath = path.resolve(__dirname, "../templates/password-reset-email.mjml");
      const template = fs.readFileSync(templatePath, "utf8");

      const token = generateInviteToken({
        name: name,
        email: to,
      }) as string;

      // Data to be replaced in the template
      const url = `${frontEndUrl}/set-new-password?${new URLSearchParams({ token }).toString()}`;

      const data = { name: name, email, url };

      // Send the email
      await sendEmail(to, "Password reset request", template, data);

      console.log("Password reset email sent");

      await logSuccess({
        eventType: "Create",
        description: `Successfully sent password reset email to ${to}`,
        functionName: "reset-password",
        fileName: "vwmailer.route.ts",
        userId: req.userId!,
        tenantId: req.tenantId!,
      });
    } else {
      // User doesn't exist, but don't reveal this information
      console.log(`Password reset requested for non-existent user: ${to}`);

      await logSuccess({
        eventType: "Create",
        description: `Password reset requested for non-existent user: ${to}`,
        functionName: "reset-password",
        fileName: "vwmailer.route.ts",
        userId: req.userId!,
        tenantId: req.tenantId!,
      });
    }

    // Always return the same response regardless of whether user exists
    return res
      .status(200)
      .json({ message: "If an account exists with this email, we'll send a password reset link" });
  } catch (error) {
    console.error("Error processing password reset:", error);

    await logFailure({
      eventType: "Create",
      description: `Failed to process password reset request for ${to}`,
      functionName: "reset-password",
      fileName: "vwmailer.route.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.tenantId!,
    });

    return res
      .status(500)
      .json({ error: "Failed to process request", details: (error as Error).message });
  }
});

export default router;
