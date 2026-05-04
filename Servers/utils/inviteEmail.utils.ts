import path from "path";
import fs from "fs/promises";
import { generateInviteToken, ONE_WEEK_MS } from "./jwt.utils";
import { frontEndUrl } from "../config/constants";
import { sendEmail } from "../services/emailService";

interface InviteEmailParams {
  email: string;
  name: string;
  surname?: string;
  roleId: number;
  organizationId: number;
}

interface InviteEmailResult {
  link: string;
  expiresAt: Date;
  info: { error?: { name: string; message: string } };
}

/**
 * Generates a token, builds the invite link, and sends the invite email.
 * Shared by initial invite (vwmailer) and resend (invitation controller).
 */
export const sendInviteEmail = async (params: InviteEmailParams): Promise<InviteEmailResult> => {
  const { email, name, surname, roleId, organizationId } = params;

  const token = generateInviteToken({
    name,
    surname,
    roleId,
    email,
    organizationId,
  }) as string;

  const link = `${frontEndUrl}/user-reg?${new URLSearchParams({
    token,
  }).toString()}`;

  const templatePath = path.resolve(__dirname, "../templates/account-creation-email.mjml");
  const template = await fs.readFile(templatePath, "utf8");

  const info = await sendEmail(email, "Create your account", template, {
    name,
    link,
  });

  const expiresAt = new Date(Date.now() + ONE_WEEK_MS);

  return { link, expiresAt, info };
};
