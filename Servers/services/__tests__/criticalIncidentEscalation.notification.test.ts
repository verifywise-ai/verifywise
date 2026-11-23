/**
 * notifyCriticalIncidentEscalation (Decision 9a): an Admin gets an in-app
 * notice and an email about a critical incident. Title, message and subject
 * are keyed into the recipient's language; the email body stays English. The
 * row's metadata names the run, which the workflow reads to notify once.
 */
const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockLanguage = jest.fn();
const mockSendTemplate = jest.fn();

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/notification.utils", () => ({
  createNotificationQuery: (...args: unknown[]) => mockCreate(...args),
  createBulkNotificationsQuery: jest.fn(),
}));
jest.mock("../../utils/userPreference.utils", () => ({
  getUserLanguage: (...args: unknown[]) => mockLanguage(...args),
}));
jest.mock("../notificationService", () => ({
  notificationService: {
    sendEmailWithTemplate: (...args: unknown[]) => mockSendTemplate(...args),
  },
}));

import {
  CRITICAL_INCIDENT_ESCALATION_ACTION,
  notifyCriticalIncidentEscalation,
} from "../inAppNotification.service";
import { getTranslator } from "../../utils/i18n.utils";
import { EMAIL_TEMPLATES } from "../../constants/emailTemplates";

const de = getTranslator("de");
const BASE_URL = "https://app.example.com";
const incident = {
  id: 99,
  reference: "INC-99",
  useCase: "Credit scoring",
  severity: "Very serious",
  type: "Security breach",
  ownerName: "Ada Owner",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([{ name: "Grace", surname: "H", email: "grace@example.com" }]);
  mockCreate.mockResolvedValue({ id: 1 });
  mockSendTemplate.mockResolvedValue(undefined);
  mockLanguage.mockResolvedValue("en");
});

describe("notifyCriticalIncidentEscalation", () => {
  it("sends the in-app notice, linked to the incident and marked with the run", async () => {
    await notifyCriticalIncidentEscalation(3, 9, incident, 11, BASE_URL);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      user_id: 9,
      type: "system",
      title: "Critical incident needs a response",
      message: 'Incident INC-99 in "Credit scoring" was rated Very serious.',
      entity_name: "INC-99",
      action_url: "/ai-incident-managements?incidentId=99",
      metadata: {
        workflow_action: CRITICAL_INCIDENT_ESCALATION_ACTION,
        workflow_run_id: 11,
        incident_id: 99,
      },
    });
    expect(mockCreate.mock.calls[0][1]).toBe(3);
  });

  it("emails the Admin with the incident's details and link", async () => {
    await notifyCriticalIncidentEscalation(3, 9, incident, 11, BASE_URL);

    expect(EMAIL_TEMPLATES.INCIDENT_CRITICAL_ESCALATION).toBe("incident-critical-escalation.mjml");
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "grace@example.com",
      "Critical incident: INC-99",
      "incident-critical-escalation.mjml",
      {
        admin_name: "Grace",
        incident_reference: "INC-99",
        use_case: "Credit scoring",
        severity: "Very serious",
        incident_type: "Security breach",
        owner_name: "Ada Owner",
        incident_url: "https://app.example.com/ai-incident-managements?incidentId=99",
      },
    );
  });

  it("translates the subject, title and message into the Admin's language", async () => {
    mockLanguage.mockResolvedValue("de");

    await notifyCriticalIncidentEscalation(3, 9, { ...incident, ownerName: null }, 11, BASE_URL);

    expect(mockCreate.mock.calls[0][0].title).toBe(de("Critical incident needs a response"));
    expect(mockCreate.mock.calls[0][0].title).not.toBe("Critical incident needs a response");
    expect(mockCreate.mock.calls[0][0].message).toBe(
      de('Incident {reference} in "{useCase}" was rated {severity}.', {
        reference: "INC-99",
        useCase: "Credit scoring",
        severity: "Very serious",
      }),
    );
    expect(mockSendTemplate.mock.calls[0][1]).toBe(
      de("Critical incident: {reference}", { reference: "INC-99" }),
    );
    expect(mockSendTemplate.mock.calls[0][3].owner_name).toBe("No owner");
  });
});
