/**
 * Dataset tools.
 *
 * Reads call the same query as the console's dataset list (dataset.ctrl.ts)
 * and return each dataset through toSafeJSON, as the console does. The
 * organizationId is fixed to the calling Admin's organization by mcp/scope.ts.
 */

import { z } from "zod";
import { getAllDatasetsQuery } from "../../utils/dataset.utils";
import { DatasetModel } from "../../domain.layer/models/dataset/dataset.model";
import { requireOrganization } from "../scope";
import { result, type ToolDef } from "../tool";

const listDatasets: ToolDef = {
  name: "list_datasets",
  title: "List datasets",
  description:
    "List an organization's datasets: name, type, source, version, owner, license, format, classification, whether it contains personal data and which kinds, status, known biases, and the ids of the models and use cases that use it.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization."),
  },
  handler: async (args) => {
    await requireOrganization(args.organizationId);
    const datasets = (await getAllDatasetsQuery(args.organizationId)) as unknown as DatasetModel[];
    return result({
      organizationId: args.organizationId,
      count: datasets.length,
      datasets: datasets.map((dataset) => dataset.toSafeJSON()),
    });
  },
};

export const datasetTools: ToolDef[] = [listDatasets];
