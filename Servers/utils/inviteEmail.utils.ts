import path from "path";
import fs from "fs/promises";
import { generateInviteTokenUntil } from "./jwt.utils";
import { frontEndUrl } from "../config/constants";
import { sendEmail } from "../services/emailService";
import { translate } from "./i18n.utils";
import { getUserByEmailQuery } from "./user.utils";
import { getUserLanguage } from "./userPreference.utils";

interface InviteEmailParams {
  email: string;
  name: string;
  surname?: string;
  roleId: number;
  organizationId: number;
  /**
   * Inviter's language. Used when the address has no user record yet.
   * A known recipient is written in the language saved in Settings.
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
 * The recipient as an existing user: whether the address already has an
 * account, and that account's saved language. A failed account lookup counts
 * as a new address, so the caller keeps the inviter's language and the sign-up
 * link; a failed language lookup only keeps the inviter's language.
 * `getUserLanguage` maps a Spanish preference to English: the backend
 * dictionaries are English, German and French.
 */
const existingRecipient = async (
  email: string,
): Promise<{ hasAccount: boolean; lang?: string }> => {
  let userId: number | undefined;
  try {
    userId = (await getUserByEmailQuery(email))?.id;
  } catch {
    // Falls back to the sign-up link, which an existing account cannot use.
    return { hasAccount: false };
  }
  if (typeof userId !== "number") return { hasAccount: false };
  try {
    return { hasAccount: true, lang: await getUserLanguage(userId) };
  } catch {
    return { hasAccount: true };
  }
};

/** Copy for an address that already has an account: log in to join, no sign-up. */
const joinCopy = (lang: string | undefined, name: string) => ({
  heading: translate(lang, "You have been invited to an organization"),
  greeting: translate(lang, "Hello {name},", { name }),
  intro: translate(
    lang,
    "An administrator has invited you to join their organization on the VerifyWise server.",
  ),
  instruction: translate(
    lang,
    "Click the button below and log in with your existing account to join.",
  ),
  button: translate(lang, "Join organization"),
  ignore: translate(lang, "If you did not expect this invitation, please ignore this email."),
  thanks: translate(lang, "Thank you."),
  footer: translate(lang, "Sent with care from VerifyWise"),
});

const inviteCopy = (lang: string | undefined, name: string) => ({
  heading: translate(lang, "Welcome to VerifyWise"),
  greeting: translate(lang, "Hello {name},", { name }),
  intro: translate(
    lang,
    "An administrator has created an account for you on the VerifyWise server.",
  ),
  instruction: translate(lang, "Click the button below to set up your account and get started."),
  button: translate(lang, "Create account"),
  ignore: translate(lang, "If you did not expect this invitation, please ignore this email."),
  thanks: translate(lang, "Thank you."),
  footer: translate(lang, "Sent with care from VerifyWise"),
});

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
  const { email, name, surname, roleId, organizationId, lang: inviterLang, expiresAt } = params;
  const recipient = await existingRecipient(email);
  const lang = recipient.lang ?? inviterLang;

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

  // Chosen when the email is sent, so a resend follows the address's current
  // state: an account by now gets the join link instead of the sign-up link.
  const link = `${frontEndUrl}/${recipient.hasAccount ? "join" : "user-reg"}?${new URLSearchParams({
    token,
  }).toString()}`;

  try {
    const templatePath = path.resolve(__dirname, "../templates/account-creation-email.mjml");
    const template = await fs.readFile(templatePath, "utf8");

    const subject = recipient.hasAccount
      ? translate(lang, "Join an organization on VerifyWise")
      : translate(lang, "Create your account");
    const info = await sendEmail(email, subject, template, {
      name,
      link,
      ...(recipient.hasAccount ? joinCopy(lang, name) : inviteCopy(lang, name)),
    });

    return { link, info };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { link, info: { error: { name: err.name, message: err.message } } };
  }
};
