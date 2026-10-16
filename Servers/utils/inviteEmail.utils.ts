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
 * Saved language for an address that already has a user. Undefined when the
 * address is new or the lookup fails, so the caller keeps the inviter's language.
 * `getUserLanguage` maps a Spanish preference to English: the backend
 * dictionaries are English, German and French.
 */
const recipientLanguage = async (email: string): Promise<string | undefined> => {
  try {
    const user = await getUserByEmailQuery(email);
    if (typeof user?.id !== "number") return undefined;
    return getUserLanguage(user.id);
  } catch {
    return undefined;
  }
};

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
  const lang = (await recipientLanguage(email)) ?? inviterLang;

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
      ...inviteCopy(lang, name),
    });

    return { link, info };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return { link, info: { error: { name: err.name, message: err.message } } };
  }
};
