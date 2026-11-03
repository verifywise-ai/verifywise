import { describe, it, expect, jest } from "@jest/globals";
import { z } from "zod";

/**
 * Stand-ins for each tool module, so the test sees exactly which tools a
 * caller is given without loading the database, queue and services behind
 * the real ones.
 */
jest.mock("../tools/organizations", () => ({
  organizationTools: [fakeTool("list_organizations", {})],
}));
jest.mock("../tools/users", () => ({
  userTools: [fakeTool("delete_user", { userId: z.number() })],
  organizationUserTools: [
    fakeTool("remove_user", { organizationId: z.number(), userId: z.number() }),
  ],
}));
jest.mock("../tools/useCases", () => ({
  useCaseTools: [fakeTool("list_use_cases", { organizationId: z.number() })],
}));
jest.mock("../tools/risks", () => ({ riskTools: [] }));
jest.mock("../tools/vendors", () => ({ vendorTools: [] }));
jest.mock("../tools/policies", () => ({ policyTools: [] }));
jest.mock("../tools/models", () => ({ modelTools: [] }));
jest.mock("../tools/incidents", () => ({ incidentTools: [] }));
jest.mock("../tools/tasks", () => ({ taskTools: [] }));
jest.mock("../tools/trainings", () => ({ trainingTools: [] }));
jest.mock("../tools/datasets", () => ({ datasetTools: [] }));
jest.mock("../tools/compliance", () => ({
  complianceTools: [fakeTool("list_frameworks", {})],
}));
jest.mock("../../utils/superAdmin.utils", () => ({ organizationExists: jest.fn() }));

/** A tool that answers with the arguments it was called with. */
function fakeTool(name: string, inputSchema: Record<string, unknown>) {
  return {
    name,
    title: name,
    description: name,
    inputSchema,
    handler: async (args: Record<string, unknown>) => ({
      content: [{ type: "text", text: JSON.stringify(args) }],
    }),
  };
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "../server";
import type { McpCaller } from "../tool";

async function connect(caller: McpCaller): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await buildMcpServer(caller).connect(serverTransport);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);
  return client;
}

const SUPER_ADMIN: McpCaller = {
  userId: 7,
  organizationId: null,
  role: "SuperAdmin",
  isSuperAdmin: true,
};
const ADMIN: McpCaller = { userId: 8, organizationId: 3, role: "Admin", isSuperAdmin: false };

describe("mcp/server", () => {
  /**
   * Organizations and their users only: the SuperAdmin role holds no use case
   * or risk permission over REST, and the isolation runbook allows no
   * super-admin write into another organization.
   */
  it("gives a super admin the deployment tools and no governance tools", async () => {
    const { tools } = await (await connect(SUPER_ADMIN)).listTools();
    expect(tools.map((t) => t.name)).toEqual(["list_organizations", "delete_user"]);
  });

  it("does not let a super admin call a governance tool", async () => {
    const client = await connect(SUPER_ADMIN);
    const res: any = await client.callTool({
      name: "list_use_cases",
      arguments: { organizationId: 3 },
    });
    expect(res.isError).toBe(true);
  });

  /**
   * Both sets share names, and the SDK refuses a name registered twice: the
   * super-admin tools win, and only the organization tools they lack are added.
   */
  it("gives an Admin who is also a super admin the super-admin tools plus their organization's, pinned", async () => {
    const caller = { ...SUPER_ADMIN, organizationId: 3, role: "Admin" };
    const client = await connect(caller);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "list_organizations",
      "delete_user",
      "remove_user",
      "list_use_cases",
      "list_frameworks",
    ]);
    for (const name of ["remove_user", "list_use_cases"]) {
      const tool = tools.find((t) => t.name === name)!;
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("organizationId");
    }

    const res: any = await client.callTool({ name: "list_use_cases", arguments: {} });
    expect(JSON.parse(res.content[0].text)).toEqual({ organizationId: 3 });
  });

  it("gives an Admin their organization's tools, with no organizationId to name", async () => {
    const { tools } = await (await connect(ADMIN)).listTools();
    expect(tools.map((t) => t.name)).toEqual(["remove_user", "list_use_cases", "list_frameworks"]);
    for (const tool of tools) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("organizationId");
    }
  });

  it("runs an Admin's call against the token's organization", async () => {
    const client = await connect(ADMIN);
    const res: any = await client.callTool({ name: "list_use_cases", arguments: {} });
    expect(JSON.parse(res.content[0].text)).toEqual({ organizationId: 3 });
  });

  it("does not let an Admin call a deployment-wide tool", async () => {
    const client = await connect(ADMIN);
    const res: any = await client.callTool({ name: "list_organizations", arguments: {} });
    expect(res.isError).toBe(true);
  });
});
