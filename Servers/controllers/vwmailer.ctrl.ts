import { Request, Response } from "express";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { createInvitationQuery } from "../utils/invitation.utils";
import { sendInviteEmail } from "../utils/inviteEmail.utils";

export const invite = async (
  _req: Request,
  res: Response,
  body: {
    to: string;
    name: string;
    surname?: string;
    roleId: number;
    organizationId: number;
  }
) => {
  const { to, name, surname, roleId, organizationId } = body;

  logProcessing({
    description: `starting invite email for user: ${to}`,
    functionName: "invite",
    fileName: "vwmailer.ctrl.ts",
    userId: _req.userId!,
    tenantId: _req.organizationId!,
  });
  logger.debug(
    `📧 Sending invitation email to ${to} for user ${name} ${surname || ""}`
  );

  try {
    const { link, expiresAt, info } = await sendInviteEmail({
      email: to,
      name,
      surname,
      roleId,
      organizationId,
    });

    // Persist invitation record
    try {
      await createInvitationQuery(
        _req.organizationId!,
        to,
        name,
        surname || "",
        roleId,
        _req.userId!,
        expiresAt
      );
    } catch (invErr) {
      console.error("Failed to persist invitation record:", invErr);
    }

    if (info.error) {
      console.error("Error sending email:", info.error);
      await logFailure({
        eventType: "Create",
        description: `Failed to send invitation email to ${to}: ${info.error.name}: ${info.error.message}`,
        functionName: "invite",
        fileName: "vwmailer.ctrl.ts",
        error: new Error(`${info.error.name}: ${info.error.message}`),
        userId: _req.userId!,
        tenantId: _req.organizationId!,
      });
      return res.status(206).json({
        error: `${info.error.name}: ${info.error.message}`,
        message: link,
      });
    } else {
      await logSuccess({
        eventType: "Create",
        description: `Successfully sent invitation email to ${to} for user ${name}`,
        functionName: "invite",
        fileName: "vwmailer.ctrl.ts",
        userId: _req.userId!,
        tenantId: _req.organizationId!,
      });
      return res.status(200).json({ message: "Email sent successfully" });
    }
  } catch (error) {
    console.error("Error sending email:", error);
    await logFailure({
      eventType: "Create",
      description: `Failed to send invitation email to ${to}`,
      functionName: "invite",
      fileName: "vwmailer.ctrl.ts",
      error: error as Error,
      userId: _req.userId!,
      tenantId: _req.organizationId!,
    });
    return res.status(500).json({
      error: "Failed to send email",
      details: (error as Error).message,
    });
  }
};
