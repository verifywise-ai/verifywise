/**
 * AI incident tools.
 *
 * The list calls the same query as the console's incident list
 * (incident-management.ctrl.ts) and returns each incident through toSafeJSON,
 * as the console does. Updates go through services/incidentManagement.service.ts,
 * the write path the console and the AI Advisor share: row lock, validation,
 * cross-organization reference checks, the reopen approval reset, change
 * history and post-commit automations.
 *
 * The organizationId is fixed to the calling Admin's organization by
 * mcp/scope.ts.
 */

import { z } from "zod";
import { getAllIncidentsQuery } from "../../utils/incidentManagement.utils";
import {
  IncidentUpdateValidationError,
  updateIncident,
} from "../../services/incidentManagement.service";
import { AIIncidentManagementModel } from "../../domain.layer/models/incidentManagement/incidemtManagement.model";
import {
  AIIncidentManagementStatus,
  IncidentType,
  Severity,
} from "../../domain.layer/enums/ai-incident-management.enum";
import { requireOrganization } from "../scope";
import { result, type ToolDef } from "../tool";

const organizationIdArg = z.number().int().positive().describe("Id of the organization.");

const listIncidents: ToolDef = {
  name: "list_incidents",
  title: "List incidents",
  description:
    "List an organization's AI incidents, archived ones included (archived: true): type, severity, status, the use case and model involved, assignee, reporter, harm categories, mitigations, corrective actions and approval state.",
  inputSchema: { organizationId: organizationIdArg },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const incidents = (await getAllIncidentsQuery(
      args.organizationId,
    )) as AIIncidentManagementModel[];
    return result({
      organizationId: args.organizationId,
      count: incidents.length,
      incidents: incidents.map((incident) => incident.toSafeJSON()),
    });
  },
};

const updateIncidentTool: ToolDef = {
  name: "update_incident",
  title: "Update incident",
  description:
    "Change an AI incident's title, description, type, severity or status. Only the fields sent are changed. Moving a Closed incident to any other status reopens it, and an Approved closure approval goes back to Pending.",
  inputSchema: {
    organizationId: organizationIdArg,
    incidentId: z.number().int().positive().describe("Id of the incident to update."),
    title: z.string().min(1).optional().describe("New title."),
    description: z
      .string()
      .optional()
      .describe("New description: 5 to 32,767 characters after trimming."),
    type: z
      .enum(Object.values(IncidentType) as [string, ...string[]])
      .optional()
      .describe("New incident type."),
    severity: z
      .enum(Object.values(Severity) as [string, ...string[]])
      .optional()
      .describe("New severity."),
    status: z
      .enum(Object.values(AIIncidentManagementStatus) as [string, ...string[]])
      .optional()
      .describe("New status."),
  },
  handler: async (args, caller) => {
    // The title is stored as ai_project, as the console and the Advisor store it.
    const updates: Record<string, unknown> = {};
    if (args.title !== undefined) updates.ai_project = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.type !== undefined) updates.type = args.type;
    if (args.severity !== undefined) updates.severity = args.severity;
    if (args.status !== undefined) updates.status = args.status;
    if (Object.keys(updates).length === 0) {
      throw new Error("Provide a title, description, type, severity or status to update.");
    }

    await requireOrganization(args.organizationId);
    let incident;
    try {
      // No expected version: like the Advisor, the model is not an editor
      // holding a loaded copy of the incident.
      incident = await updateIncident(args.organizationId, args.incidentId, updates, caller.userId);
    } catch (error) {
      if (error instanceof IncidentUpdateValidationError) {
        throw new Error(error.errors.map((e) => e.message).join(" "));
      }
      throw error;
    }
    if (!incident) {
      throw new Error(
        `No incident with id ${args.incidentId} in organization ${args.organizationId}.`,
      );
    }
    return result({ incident: incident.toSafeJSON() });
  },
};

export const incidentTools: ToolDef[] = [listIncidents, updateIncidentTool];
