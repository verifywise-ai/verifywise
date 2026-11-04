import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/incidentManagement.utils", () => ({
  getAllIncidentsQuery: jest.fn(),
}));
jest.mock("../../services/incidentManagement.service", () => ({
  IncidentUpdateValidationError: class IncidentUpdateValidationError extends Error {
    constructor(public errors: { message: string }[]) {
      super("Incident update validation failed");
    }
  },
  updateIncident: jest.fn(),
}));
jest.mock("../scope", () => ({
  requireOrganization: jest.fn<any>().mockResolvedValue(undefined),
}));

import { getAllIncidentsQuery } from "../../utils/incidentManagement.utils";
import {
  IncidentUpdateValidationError,
  updateIncident,
} from "../../services/incidentManagement.service";
import { incidentTools } from "../tools/incidents";

const CALLER = { userId: 7, organizationId: 3, role: "Admin", isSuperAdmin: false };

const tool = (name: string) => {
  const found = incidentTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};
const payload = (res: any) => JSON.parse(res.content[0].text);
const incident = (fields: object) => ({ toSafeJSON: () => fields });

describe("mcp/tools/incidents", () => {
  beforeEach(() => jest.clearAllMocks());

  it("list_incidents returns each incident through toSafeJSON, as the console does", async () => {
    (getAllIncidentsQuery as jest.Mock<any>).mockResolvedValue([incident({ id: 1 })]);
    const res = await tool("list_incidents").handler({ organizationId: 3 }, CALLER);
    expect(getAllIncidentsQuery).toHaveBeenCalledWith(3);
    expect(payload(res)).toEqual({ organizationId: 3, count: 1, incidents: [{ id: 1 }] });
  });

  /** The title is the ai_project column, as the console and the Advisor write it. */
  it("update_incident sends only the fields given, title as ai_project, attributed to the caller", async () => {
    (updateIncident as jest.Mock<any>).mockResolvedValue(incident({ id: 4, status: "Closed" }));
    const res = await tool("update_incident").handler(
      { organizationId: 3, incidentId: 4, title: "Drift in scoring", status: "Closed" },
      CALLER,
    );
    expect(updateIncident).toHaveBeenCalledWith(
      3,
      4,
      { ai_project: "Drift in scoring", status: "Closed" },
      7,
    );
    expect(payload(res)).toEqual({ incident: { id: 4, status: "Closed" } });
  });

  it("update_incident refuses a call with nothing to change", async () => {
    await expect(
      tool("update_incident").handler({ organizationId: 3, incidentId: 4 }, CALLER),
    ).rejects.toThrow("Provide a title, description, type, severity or status to update.");
    expect(updateIncident).not.toHaveBeenCalled();
  });

  it("update_incident reports the service's field messages", async () => {
    (updateIncident as jest.Mock<any>).mockRejectedValue(
      new (IncidentUpdateValidationError as any)([
        { message: "Description must be at least 5 characters." },
      ]),
    );
    await expect(
      tool("update_incident").handler(
        { organizationId: 3, incidentId: 4, description: "bad" },
        CALLER,
      ),
    ).rejects.toThrow("Description must be at least 5 characters.");
  });

  it("update_incident names an incident that is not in the organization", async () => {
    (updateIncident as jest.Mock<any>).mockResolvedValue(null);
    await expect(
      tool("update_incident").handler(
        { organizationId: 3, incidentId: 99, status: "Open" },
        CALLER,
      ),
    ).rejects.toThrow("No incident with id 99 in organization 3.");
  });

  it("update_incident offers only the incident enums as choices", () => {
    const schema = tool("update_incident").inputSchema;
    expect(schema.severity.safeParse("Critical").success).toBe(false);
    expect(schema.severity.safeParse("Very serious").success).toBe(true);
    expect(schema.status.safeParse("Emergency action").success).toBe(true);
    expect(schema.type.safeParse("Model drift").success).toBe(true);
  });
});
