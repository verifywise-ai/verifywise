/**
 * buildCriticalIncidentEscalation (Decision 9a): one Admin's notice about a
 * critical incident, built but not stored or sent (the workflow claims and
 * delivers it). Title, message, subject and the severity label are in the
 * Admin's language; the email body stays English. publishInAppNotification is
 * the real-time publish shared with sendInAppNotification.
 */
const mockQuery = jest.fn();
const mockLanguage = jest.fn();
const mockPublish = jest.fn();

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: (...args: unknown[]) => mockPublish(...args) },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/notification.utils", () => ({
  createNotificationQuery: jest.fn(),
  createBulkNotificationsQuery: jest.fn(),
}));
jest.mock("../../utils/userPreference.utils", () => ({
  getUserLanguage: (...args: unknown[]) => mockLanguage(...args),
}));
jest.mock("../notificationService", () => ({
  notificationService: { sendEmailWithTemplate: jest.fn() },
}));

import {
  buildCriticalIncidentEscalation,
  CRITICAL_INCIDENT_ESCALATION_ACTION,
  incidentSeverityLabel,
  publishInAppNotification,
} from "../inAppNotification.service";
import { notificationService } from "../notificationService";
import { createNotificationQuery } from "../../utils/notification.utils";
import { getTranslator } from "../../utils/i18n.utils";

const de = getTranslator("de");
const BASE_URL = "https://app.example.com";
const incident = {
  id: 99,
  reference: "INC-99",
  displayId: "INC-99",
  useCase: "Credit scoring",
  severity: "Very serious",
  type: "Security breach",
  ownerName: "Ada Owner",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([{ name: "Grace", surname: "H", email: "grace@example.com" }]);
  mockLanguage.mockResolvedValue("en");
  mockPublish.mockResolvedValue(1);
});

describe("buildCriticalIncidentEscalation", () => {
  it("builds the in-app row, linked to the incident and marked with the run", async () => {
    const built = await buildCriticalIncidentEscalation(9, incident, 11, BASE_URL);

    expect(built.notification).toEqual({
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
  });

  it("builds the email with the incident's details and link", async () => {
    const built = await buildCriticalIncidentEscalation(9, incident, 11, BASE_URL);

    expect(built.email).toEqual({
      to: "grace@example.com",
      subject: "Critical incident: INC-99",
      template: "incident-critical-escalation.mjml",
      variables: {
        admin_name: "Grace",
        incident_reference: "INC-99",
        use_case: "Credit scoring",
        severity: "Very serious",
        incident_type: "Security breach",
        owner_name: "Ada Owner",
        incident_url: "https://app.example.com/ai-incident-managements?incidentId=99",
      },
    });
  });

  it("stores and sends nothing", async () => {
    await buildCriticalIncidentEscalation(9, incident, 11, BASE_URL);

    expect(createNotificationQuery).not.toHaveBeenCalled();
    expect(notificationService.sendEmailWithTemplate).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("writes title, message, subject and the severity label in the Admin's language", async () => {
    mockLanguage.mockResolvedValue("de");

    const built = await buildCriticalIncidentEscalation(
      9,
      { ...incident, ownerName: null },
      11,
      BASE_URL,
    );

    expect(built.notification.title).toBe(de("Critical incident needs a response"));
    expect(built.notification.title).not.toBe("Critical incident needs a response");
    expect(built.notification.message).toBe(
      de('Incident {reference} in "{useCase}" was rated {severity}.', {
        reference: "INC-99",
        useCase: "Credit scoring",
        severity: "Sehr schwerwiegend",
      }),
    );
    // No English enum value inside the German sentence.
    expect(built.notification.message).not.toContain("Very serious");
    expect(built.email.subject).toBe(de("Critical incident: {reference}", { reference: "INC-99" }));
    expect(built.email.variables.owner_name).toBe("No owner");
    // The email body template is English.
    expect(built.email.variables.severity).toBe("Very serious");
  });

  it("has no address for an Admin without one", async () => {
    mockQuery.mockResolvedValue([]);

    const built = await buildCriticalIncidentEscalation(9, incident, 11, BASE_URL);

    expect(built.email.to).toBeNull();
    expect(built.email.variables.admin_name).toBe("Admin");
  });
});

describe("incidentSeverityLabel", () => {
  it("translates each severity and leaves an unknown value as stored", () => {
    expect(incidentSeverityLabel("de", "Minor")).toBe("Gering");
    expect(incidentSeverityLabel("fr", "Serious")).toBe("Grave");
    expect(incidentSeverityLabel("fr", "Very serious")).toBe("Très grave");
    expect(incidentSeverityLabel("en", "Very serious")).toBe("Very serious");
    expect(incidentSeverityLabel("de", "critical")).toBe("critical");
  });
});

describe("publishInAppNotification", () => {
  it("publishes the stored row on the in-app channel", async () => {
    await publishInAppNotification(3, { id: 5, user_id: 9 } as any);

    expect(mockPublish).toHaveBeenCalledWith("in-app-notifications", expect.any(String));
    expect(JSON.parse(mockPublish.mock.calls[0][1])).toMatchObject({
      organizationId: 3,
      userId: 9,
      notification: { id: 5, user_id: 9 },
    });
  });
});
