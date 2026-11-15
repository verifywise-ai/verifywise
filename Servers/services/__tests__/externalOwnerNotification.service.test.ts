import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn<any>().mockResolvedValue(undefined) },
}));
jest.mock("../../utils/organization.utils", () => ({
  getOrganizationByIdQuery: jest.fn<any>().mockResolvedValue({ name: "Acme" }),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { status: "ready", multi: jest.fn() },
}));

import {
  ASSIGNMENT_EMAILS_PER_USER_PER_HOUR,
  notifyExternalOwnerAssigned,
  notifyExternalOwnerConfirmationDue,
} from "../externalOwnerNotification.service";
import { notificationService } from "../notificationService";
import redisClient from "../../database/redis";
import logger from "../../utils/logger/fileLogger";
import { sequelize } from "../../database/db";
import { getOrganizationByIdQuery } from "../../utils/organization.utils";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";

const send = notificationService.sendEmailWithTemplate as unknown as jest.Mock<any>;
const query = sequelize.query as unknown as jest.Mock<any>;

const recipient = { name: "Ada Lovelace", email: "ada@example.com" };
const contactRow = { name: "Grace", surname: "Hopper", email: "grace@acme.test" };

const redis = redisClient as unknown as { status: string; multi: jest.Mock<any> };
const exec = jest.fn<any>();
const incr = jest.fn<any>();
const expire = jest.fn<any>();
const redisChain = { incr, expire, exec };

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([contactRow]);
  send.mockResolvedValue(undefined);
  redis.status = "ready";
  redis.multi.mockReturnValue(redisChain);
  incr.mockReturnValue(redisChain);
  expire.mockReturnValue(redisChain);
  exec.mockResolvedValue([
    [null, 1],
    [null, 1],
  ]);
});

describe("notifyExternalOwnerAssigned hourly limit", () => {
  const assign = () =>
    notifyExternalOwnerAssigned({
      organizationId: 3,
      useCaseTitle: "Chatbot",
      recipient,
      assignedByUserId: 8,
    });

  it("counts per organization and sender, with an expiry", async () => {
    await assign();
    const key = incr.mock.calls[0][0] as string;
    expect(key).toMatch(/^external-owner:assigned:3:8:\d{10}$/);
    expect(expire).toHaveBeenCalledWith(key, 3600);
    expect(key).not.toContain("ada@example.com");
  });

  it("sends the last email within the limit", async () => {
    exec.mockResolvedValue([
      [null, ASSIGNMENT_EMAILS_PER_USER_PER_HOUR],
      [null, 1],
    ]);
    await assign();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips the email over the limit, resolves, and logs without the address", async () => {
    exec.mockResolvedValue([
      [null, ASSIGNMENT_EMAILS_PER_USER_PER_HOUR + 1],
      [null, 1],
    ]);
    await expect(assign()).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    const warning = (logger.warn as unknown as jest.Mock<any>).mock.calls[0][0] as string;
    expect(warning).toContain("over the hourly limit");
    expect(warning).not.toContain("ada@example.com");
  });

  it("still sends when Redis is not connected, without queueing a count", async () => {
    redis.status = "reconnecting";
    await assign();
    expect(redis.multi).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("still sends when Redis errors or does not answer", async () => {
    exec.mockRejectedValueOnce(new Error("redis down"));
    await assign();
    expect(send).toHaveBeenCalledTimes(1);

    exec.mockReturnValueOnce(new Promise(() => undefined));
    await assign();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("resolves without waiting for the mail provider", async () => {
    send.mockReturnValueOnce(new Promise(() => undefined));
    await expect(assign()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("logs a failed send instead of rejecting", async () => {
    send.mockRejectedValueOnce(new Error("smtp down"));
    await expect(assign()).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to notify external owner:",
      expect.any(Error),
    );
  });

  it("does not count still-live reminders against the limit", async () => {
    exec.mockResolvedValue([
      [null, ASSIGNMENT_EMAILS_PER_USER_PER_HOUR + 1],
      [null, 1],
    ]);
    await notifyExternalOwnerConfirmationDue({
      organizationId: 3,
      entryTitle: "Chatbot",
      noun: "use case",
      since: "2026-06-01",
      intervalDays: 90,
      recipient,
      contactUserId: 8,
    });
    expect(redis.multi).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("notifyExternalOwnerAssigned", () => {
  it("emails the external owner using the external template, with a contact and no link", async () => {
    await notifyExternalOwnerAssigned({
      organizationId: 3,
      useCaseTitle: "Chatbot",
      recipient,
      assignedByUserId: 8,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, template, variables] = send.mock.calls[0] as [
      string,
      string,
      string,
      Record<string, string>,
    ];
    expect(to).toBe("ada@example.com");
    expect(template).toBe(EMAIL_TEMPLATES.EXTERNAL_OWNER_NOTICE);
    expect(subject).toContain("Chatbot");
    expect(variables.recipient_name).toBe("Ada Lovelace");
    expect(variables.contact_message).toContain("Grace Hopper");
    expect(variables.contact_message).toContain("grace@acme.test");
    expect(Object.values(variables).join(" ")).not.toMatch(/https?:\/\//);
  });

  it("falls back to generic wording when no contact can be found", async () => {
    query.mockResolvedValue([]);
    await notifyExternalOwnerAssigned({
      organizationId: 3,
      useCaseTitle: "Chatbot",
      recipient,
      assignedByUserId: 8,
    });
    const variables = send.mock.calls[0][3] as Record<string, string>;
    expect(variables.contact_message).toContain("an administrator of Acme");
    expect(variables.contact_message).not.toContain("null");
    expect(variables.contact_message).not.toContain("undefined");
  });

  it("still sends the email when the contact lookup itself fails", async () => {
    query.mockRejectedValue(new Error("db down"));
    await notifyExternalOwnerAssigned({
      organizationId: 3,
      useCaseTitle: "Chatbot",
      recipient,
      assignedByUserId: 8,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("scopes the contact lookup to the organization", async () => {
    await notifyExternalOwnerAssigned({
      organizationId: 3,
      useCaseTitle: "Chatbot",
      recipient,
      assignedByUserId: 8,
    });
    const [sql, options] = query.mock.calls[0] as [string, { replacements: any }];
    expect(sql).toContain("organization_members");
    expect(options.replacements.organizationId).toBe(3);
  });
});

describe("notifyExternalOwnerConfirmationDue", () => {
  const entry = {
    organizationId: 3,
    entryTitle: "Chatbot",
    noun: "use case",
    since: "2026-06-01",
    intervalDays: 90,
    recipient,
    contactUserId: 8,
  };

  it("asks the owner to contact a named person and never offers an app link", async () => {
    await notifyExternalOwnerConfirmationDue(entry);

    const [to, , template, variables] = send.mock.calls[0] as [
      string,
      string,
      string,
      Record<string, string>,
    ];
    expect(to).toBe("ada@example.com");
    expect(template).toBe(EMAIL_TEMPLATES.EXTERNAL_OWNER_NOTICE);
    expect(variables.message).toContain("2026-06-01");
    expect(variables.message).toContain("90");
    expect(variables.message).toContain("Acme asks owners");
    expect(variables.contact_message).toBe(
      "Please tell Grace Hopper (grace@acme.test) whether it is still in use, so they can confirm it or retire it.",
    );
    expect(variables.contact_message).toContain("Grace Hopper");
    expect(Object.values(variables).join(" ")).not.toMatch(/https?:\/\//);
    expect(Object.values(variables).join(" ").toLowerCase()).not.toContain("log in");
  });

  it("names the organization in the fallback contact too", async () => {
    query.mockResolvedValue([]);
    await notifyExternalOwnerConfirmationDue(entry);
    const variables = send.mock.calls[0][3] as Record<string, string>;
    expect(variables.contact_message).toBe(
      "Please tell an administrator of Acme whether it is still in use, so they can confirm it or retire it.",
    );
  });

  it("reads correctly when the organization cannot be looked up", async () => {
    query.mockResolvedValue([]);
    (getOrganizationByIdQuery as unknown as jest.Mock<any>).mockRejectedValueOnce(
      new Error("db down"),
    );
    await notifyExternalOwnerConfirmationDue(entry);
    const variables = send.mock.calls[0][3] as Record<string, string>;
    expect(variables.message).toContain("your organization asks owners");
    expect(variables.contact_message).toBe(
      "Please tell an administrator of your organization whether it is still in use, so they can confirm it or retire it.",
    );
  });

  it("propagates a send failure so the sweep can retry tomorrow", async () => {
    send.mockRejectedValueOnce(new Error("smtp down"));
    await expect(notifyExternalOwnerConfirmationDue(entry)).rejects.toThrow("smtp down");
  });
});

describe("external-owner-notice template", () => {
  const template = fs.readFileSync(
    path.join(__dirname, "..", "..", "templates", "external-owner-notice.mjml"),
    "utf8",
  );

  it("escapes user-supplied values", async () => {
    const html = await compileMjmlToHtml(template, {
      recipient_name: "<img src=x onerror=alert(1)>",
      heading: "Heading <b>x</b>",
      message: "Body",
      action_message: "Action",
      contact_message: "Contact",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<b>x</b>");
  });

  it("has no link or button for a recipient without an account", () => {
    expect(template).not.toMatch(/<a\s/);
    expect(template).not.toMatch(/mj-button/);
  });
});
