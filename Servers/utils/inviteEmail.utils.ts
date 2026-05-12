import path from "path";
import fs from "fs/promises";
import { generateInviteToken, ONE_WEEK_MS } from "./jwt.utils";
import { frontEndUrl } from "../config/constants";
import { sendEmail } from "../services/emailService";
import { translate } from "./i18n.utils";

interface InviteEmailParams {
  email: string;
  name: string;
  surname?: string;
  roleId: number;
  organizationId: number;
  /**
   * Inviter's language. The invitee gets the email in the inviter's locale.
   * TODO(i18n-v2): for known recipients, prefer their stored language via
   * `getPreferencesByUserQuery(recipientUserId).language`. Invitees have no
   * user record yet, so the inviter's locale stays the right default.
   */
  lang?: string;
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
  const { email, name, surname, roleId, organizationId, lang } = params;

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

  const subject = translate(lang, "Create your account");
  const info = await sendEmail(email, subject, template, {
    name,
    link,
  });

  const expiresAt = new Date(Date.now() + ONE_WEEK_MS);

  return { link, expiresAt, info };
};
