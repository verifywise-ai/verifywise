import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  getGroupById,
  listGroupMembers,
  listGroups,
  listProjectGroups,
  removeGroupMember,
  setGroupMembers,
  setProjectGroups,
  updateGroup,
} from "../group.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const api = apiServices as unknown as Record<
  "get" | "post" | "patch" | "put" | "delete",
  ReturnType<typeof vi.fn>
>;

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(api)) fn.mockResolvedValue({ data: { data: {} } });
});

// The groups router is mounted only at /api/v1/groups; the client base URL is
// `${URL}/api`, so a path without /v1 404s.
describe("group repository paths (#5253)", () => {
  it.each<[string, () => Promise<unknown>, keyof typeof api, string]>([
    ["listGroups", () => listGroups(), "get", "/v1/groups"],
    ["getGroupById", () => getGroupById({ id: 3 }), "get", "/v1/groups/3"],
    ["createGroup", () => createGroup({ name: "Team" }), "post", "/v1/groups"],
    ["updateGroup", () => updateGroup({ id: 3, body: { name: "Team" } }), "patch", "/v1/groups/3"],
    ["deleteGroup", () => deleteGroup(3), "delete", "/v1/groups/3"],
    ["listGroupMembers", () => listGroupMembers({ id: 3 }), "get", "/v1/groups/3/members"],
    [
      "addGroupMembers",
      () => addGroupMembers({ id: 3, userIds: [1] }),
      "post",
      "/v1/groups/3/members",
    ],
    [
      "setGroupMembers",
      () => setGroupMembers({ id: 3, userIds: [1] }),
      "put",
      "/v1/groups/3/members",
    ],
    [
      "removeGroupMember",
      () => removeGroupMember({ id: 3, userId: 1 }),
      "delete",
      "/v1/groups/3/members/1",
    ],
    [
      "listProjectGroups",
      () => listProjectGroups({ projectId: 9 }),
      "get",
      "/v1/groups/projects/9/groups",
    ],
    [
      "setProjectGroups",
      () => setProjectGroups({ projectId: 9, groupIds: [3] }),
      "put",
      "/v1/groups/projects/9/groups",
    ],
  ])("%s calls the v1 route", async (_name, call, method, path) => {
    await call();
    expect(api[method]).toHaveBeenCalledTimes(1);
    expect(api[method].mock.calls[0][0]).toBe(path);
  });
});
