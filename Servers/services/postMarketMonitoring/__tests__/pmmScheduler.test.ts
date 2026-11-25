jest.mock("../../../database/db", () => ({ sequelize: {} }));
jest.mock("../../../utils/organization.utils", () => ({ getAllOrganizationsQuery: jest.fn() }));
jest.mock("../../../utils/postMarketMonitoring.utils", () => ({}));
jest.mock("../../automations/automationProducer", () => ({ enqueueAutomationAction: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { buildNotificationData } from "../pmmScheduler";

describe("buildNotificationData monitoring_link", () => {
  const original = process.env.FRONTEND_URL;
  const cycle = {
    due_at: new Date("2026-12-01T00:00:00Z"),
    cycle_number: 2,
    stakeholder_name: "Sam",
    stakeholder_email: "sam@example.com",
    project_title: "Credit scoring",
  } as any;

  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it("opens the use case's monitoring tab at FRONTEND_URL", () => {
    process.env.FRONTEND_URL = "https://vw.example.com";
    const data = buildNotificationData(cycle, { project_id: 12 }, "Acme");
    expect(data.monitoring_link).toBe(
      "https://vw.example.com/project-view?projectId=12&tab=monitoring",
    );
  });

  it("uses the shared default when FRONTEND_URL is unset", () => {
    delete process.env.FRONTEND_URL;
    const data = buildNotificationData(cycle, { project_id: 12 }, "Acme");
    expect(data.monitoring_link).toBe(
      "http://localhost:5173/project-view?projectId=12&tab=monitoring",
    );
  });
});
