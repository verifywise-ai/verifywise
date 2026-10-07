import path from "path";
import fs from "fs/promises";
import { generateInviteTokenUntil } from "./jwt.utils";
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
  /**
   * The stored invitations.expires_at. Callers save the row first, then send
   * a link signed for that instant, so the link matches its row.
   */
  expiresAt: Date;
}

interface InviteEmailResult {
  link: string;
  info: { error?: { name: string; message: string } };
}

/**
 * Generates a token, builds the invite link, and sends the invite email.
 * Shared by initial invite (vwmailer), resend (invitation controller) and the
 * super-admin invite.
 *
 * Callers have already saved the invitation for `expiresAt`, so this never
 * throws on a failed send: the error comes back in `info.error` with the
 * link, which the caller hands to the admin to share instead.
 *
 * It does throw, before sending anything, if the link cannot be signed
 * (for example JWT_SECRET is unset): there is no working link to email or
 * to hand back.
 */
export const sendInviteEmail = async (params: InviteEmailParams): Promise<InviteEmailResult> => {
  const { email, name, surname, roleId, organizationId, lang, expiresAt } = params;

  const token = generateInviteTokenUntil(
    {
      name,
      surname,
      roleId,
      email,
      organizationId,
    },
    expiresAt,
  );
  if (!token) {
    throw new Error("Could not sign the invitation link");
  }

  const link = `${frontEndUrl}/user-reg?${new URLSearchParams({
    token,
  }).toString()}`;

  try {
    const templatePath = path.resolve(__dirname, "../templates/account-creation-email.mjml");
    const template = await fs.readFile(templatePath, "utf8");

    const subject = translate(lang, "Create your account");
    const info = await sendEmail(email, subject, template, {
      name,
      link,
    });

    return { link, info };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { link, info: { error: { name: err.name, message: err.message } } };
  }
};
