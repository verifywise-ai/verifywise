/**
 * Model inventory tools.
 *
 * Reads call the same query as the console's model inventory list
 * (modelInventory.ctrl.ts) and return each model through toSafeJSON, as the
 * console does. The organizationId is fixed to the calling Admin's
 * organization by mcp/scope.ts.
 */

import { z } from "zod";
import { getAllModelInventoriesQuery } from "../../utils/modelInventory.utils";
import { ModelInventoryModel } from "../../domain.layer/models/modelInventory/modelInventory.model";
import { requireOrganization } from "../scope";
import { result, type ToolDef } from "../tool";

const listModels: ToolDef = {
  name: "list_models",
  title: "List models",
  description:
    "List an organization's model inventory: each model's provider, name, version, approver, status, capabilities, hosting provider, intended use, known biases and limitations, and the ids of the use cases and frameworks it is linked to.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const models = (await getAllModelInventoriesQuery(
      args.organizationId,
    )) as unknown as ModelInventoryModel[];
    return result({
      organizationId: args.organizationId,
      count: models.length,
      models: models.map((model) => model.toSafeJSON()),
    });
  },
};

export const modelTools: ToolDef[] = [listModels];
