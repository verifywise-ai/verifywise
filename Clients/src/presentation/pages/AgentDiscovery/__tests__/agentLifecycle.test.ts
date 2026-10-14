import { AgentPrimitiveRow } from "src/domain/interfaces/i.agentDiscovery";
import { getAgentLifecycle } from "../agentLifecycle";

const baseAgent: AgentPrimitiveRow = {
  id: 1,
  source_system: "manual",
  primitive_type: "agent",
  external_id: "manual_1",
  display_name: "Agent",
  owner_id: null,
  permissions: [],
  permission_categories: [],
  last_activity: null,
  metadata: {},
  review_status: "unreviewed",
  reviewed_by: null,
  reviewed_at: null,
  linked_model_inventory_id: null,
  is_stale: false,
  is_manual: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  owner_ids: [],
};

const formatDateTime = (iso: string) => iso;
const formatUser = (id: number | string) => `name:${id}`;
const addedOwner = (agent: Partial<AgentPrimitiveRow>) =>
  getAgentLifecycle({ ...baseAgent, ...agent }, formatDateTime, formatUser)[0].owner;

describe("getAgentLifecycle Added step owner", () => {
  it("uses the primary of the owner set, like the Owners card", () => {
    // owner_id is stale here; the owner rows are the source of truth.
    expect(addedOwner({ owner_ids: [2, 1], owner_id: "1" })).toBe("name:2");
  });

  it("shows a synced agent's source-reported owner", () => {
    expect(
      addedOwner({ is_manual: false, source_system: "azure-ai-foundry", owner_id: "a@x.example" }),
    ).toBe("name:a@x.example");
  });

  it("shows a manual agent's legacy free-text owner", () => {
    expect(addedOwner({ owner_id: "Data team" })).toBe("name:Data team");
  });

  it("shows no owner for a manual agent's numeric owner_id without owner rows", () => {
    expect(addedOwner({ owner_id: "9" })).toBeNull();
  });

  it("shows no owner when there is none", () => {
    expect(addedOwner({})).toBeNull();
  });

  it("keeps the step's timestamp and state", () => {
    const [added] = getAgentLifecycle(baseAgent, formatDateTime, formatUser);
    expect(added).toEqual(
      expect.objectContaining({ key: "added", state: "done", timestamp: baseAgent.created_at }),
    );
  });
});
