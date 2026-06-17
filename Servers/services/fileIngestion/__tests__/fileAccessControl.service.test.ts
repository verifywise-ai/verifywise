import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../utils/user.utils", () => ({
  getUserProjects: jest.fn<any>(),
}));

jest.mock("../../../utils/project.utils", () => ({
  getProjectByIdQuery: jest.fn<any>(),
}));

import { assertFileAccess } from "../fileAccessControl.service";
import { getUserProjects } from "../../../utils/user.utils";
import { getProjectByIdQuery } from "../../../utils/project.utils";

const mockGetUserProjects = getUserProjects as jest.MockedFunction<typeof getUserProjects>;
const mockGetProjectByIdQuery = getProjectByIdQuery as jest.MockedFunction<
  typeof getProjectByIdQuery
>;

describe("assertFileAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("organization files (project_id null)", () => {
    it("allows access when org_id matches", async () => {
      const result = await assertFileAccess(
        { project_id: null, org_id: 7, uploaded_by: 1 },
        1,
        7,
      );
      expect(result).toEqual({ allowed: true });
    });

    it("denies access when org_id differs", async () => {
      const result = await assertFileAccess(
        { project_id: null, org_id: 7, uploaded_by: 1 },
        1,
        99,
      );
      expect(result).toEqual({ allowed: false, reason: "access_denied" });
    });
  });

  describe("project files (project_id set)", () => {
    it("allows access for project member", async () => {
      mockGetUserProjects.mockResolvedValueOnce([{ id: 5 }, { id: 6 }] as any);
      mockGetProjectByIdQuery.mockResolvedValueOnce({ owner: 99 } as any);

      const result = await assertFileAccess({ project_id: 5, uploaded_by: 99 }, 1, 7);

      expect(result).toEqual({ allowed: true });
    });

    it("allows access for project owner even if not a member", async () => {
      mockGetUserProjects.mockResolvedValueOnce([] as any);
      mockGetProjectByIdQuery.mockResolvedValueOnce({ owner: 1 } as any);

      const result = await assertFileAccess({ project_id: 5, uploaded_by: 99 }, 1, 7);
      expect(result).toEqual({ allowed: true });
    });

    it("allows access for file owner even if not a member nor project owner", async () => {
      mockGetUserProjects.mockResolvedValueOnce([] as any);
      mockGetProjectByIdQuery.mockResolvedValueOnce({ owner: 99 } as any);

      const result = await assertFileAccess({ project_id: 5, uploaded_by: 1 }, 1, 7);
      expect(result).toEqual({ allowed: true });
    });

    it("denies when user is none of: member, project owner, file owner", async () => {
      mockGetUserProjects.mockResolvedValueOnce([{ id: 6 }] as any);
      mockGetProjectByIdQuery.mockResolvedValueOnce({ owner: 99 } as any);

      const result = await assertFileAccess({ project_id: 5, uploaded_by: 99 }, 1, 7);
      expect(result).toEqual({ allowed: false, reason: "access_denied" });
    });

    it("handles project lookup returning null gracefully", async () => {
      mockGetUserProjects.mockResolvedValueOnce([{ id: 5 }] as any);
      mockGetProjectByIdQuery.mockResolvedValueOnce(null as any);

      const result = await assertFileAccess({ project_id: 5, uploaded_by: 99 }, 1, 7);
      expect(result).toEqual({ allowed: true });
    });
  });
});
