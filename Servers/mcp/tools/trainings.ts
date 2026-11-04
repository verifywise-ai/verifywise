/**
 * Training registry tools.
 *
 * Reads call the same query as the console's training registry list
 * (trainingRegistar.ctrl.ts), so the model sees what the console shows. The
 * organizationId is fixed to the calling Admin's organization by mcp/scope.ts.
 */

import { z } from "zod";
import { getAllTrainingRegistarQuery } from "../../utils/trainingRegistar.utils";
import { requireOrganization } from "../scope";
import { result, type ToolDef } from "../tool";

const listTrainings: ToolDef = {
  name: "list_trainings",
  title: "List trainings",
  description:
    "List an organization's AI training registry: each training's name, provider, department, number of people, duration, status and description.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const trainings = await getAllTrainingRegistarQuery(args.organizationId);
    return result({ organizationId: args.organizationId, count: trainings.length, trainings });
  },
};

export const trainingTools: ToolDef[] = [listTrainings];
