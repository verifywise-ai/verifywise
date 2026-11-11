/**
 * Task tools.
 *
 * Reads call the same query as the console's task list (task.ctrl.ts) and add
 * each task's assignees and linked entities the way the console does. The
 * organizationId is fixed to the calling Admin's organization by mcp/scope.ts.
 */

import { z } from "zod";
import { getTasksQuery } from "../../utils/task.utils";
import { requireOrganization } from "../scope";
import { result, type ToolDef } from "../tool";

const listTasks: ToolDef = {
  name: "list_tasks",
  title: "List tasks",
  description:
    "List an organization's governance tasks, deleted ones left out: title, description, status, priority, due date, categories, creator, assignees and the entities each task is linked to.",
  inputSchema: {
    organizationId: z.number().int().positive().describe("Id of the organization."),
  },
  handler: async (args, caller) => {
    await requireOrganization(args.organizationId);
    // The caller's role decides visibility, as in the console: an Admin sees
    // every task in the organization.
    const tasks = await getTasksQuery(
      { userId: caller.userId, role: caller.role },
      args.organizationId,
    );
    return result({
      organizationId: args.organizationId,
      count: tasks.length,
      tasks: tasks.map((task) => ({
        ...task.toJSON(),
        assignees: (task.dataValues as any)["assignees"] || [],
        entity_links: (task.dataValues as any)["entity_links"] || [],
      })),
    });
  },
};

export const taskTools: ToolDef[] = [listTasks];
