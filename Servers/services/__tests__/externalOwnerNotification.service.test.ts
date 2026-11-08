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

import {
  notifyExternalOwnerAssigned,
  notifyExternalOwnerConfirmationDue,
} from "../externalOwnerNotification.service";
import { notificationService } from "../notificationService";
import { sequelize } from "../../database/db";
import { getOrganizationByIdQuery } from "../../utils/organization.utils";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";

const send = notificationService.sendEmailWithTemplate as unknown as jest.Mock<any>;
const query = sequelize.query as unknown as jest.Mock<any>;

const recipient = { name: "Ada Lovelace", email: "ada@example.com" };
const contactRow = { name: "Grace", surname: "Hopper", email: "grace@acme.test" };

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([contactRow]);
  send.mockResolvedValue(undefined);
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
