import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../utils/user.utils", () => ({
  getUserProjects: jest.fn<any>(),
}));

jest.mock("../../../utils/logger/logHelper", () => ({
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../projectNotifications", () => ({
  sendMemberRoleChangedEditorToAdminNotification: jest.fn<any>(),
}));

import { notifyRoleChangedEditorToAdmin } from "../roleChangeNotifications";
import { getUserProjects } from "../../../utils/user.utils";
import { logFailure } from "../../../utils/logger/logHelper";
import { sendMemberRoleChangedEditorToAdminNotification } from "../projectNotifications";

const mockProjects = getUserProjects as jest.MockedFunction<typeof getUserProjects>;
const mockSend = sendMemberRoleChangedEditorToAdminNotification as jest.MockedFunction<
  typeof sendMemberRoleChangedEditorToAdminNotification
>;
const mockLogFailure = logFailure as jest.MockedFunction<typeof logFailure>;

describe("notifyRoleChangedEditorToAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("dispatches one notification per project", async () => {
    mockProjects.mockResolvedValueOnce([
      { id: 1, project_title: "Proj A" },
      { id: 2, project_title: "Proj B" },
    ] as any);
    mockSend.mockResolvedValue(undefined as any);

    await notifyRoleChangedEditorToAdmin({
      userId: 7,
      actorId: 9,
      organizationId: 99,
      functionName: "test",
      fileName: "test.ts",
      loggerUserId: 9,
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect((mockSend.mock.calls[0][0] as any).projectId).toBe(1);
    expect((mockSend.mock.calls[1][0] as any).projectId).toBe(2);
  });

  it("logs but does not throw if fetching projects fails", async () => {
    mockProjects.mockRejectedValueOnce(new Error("db down"));
    await expect(
      notifyRoleChangedEditorToAdmin({
        userId: 7,
        actorId: 9,
        organizationId: 99,
        functionName: "test",
        fileName: "test.ts",
        loggerUserId: 9,
      }),
    ).resolves.toBeUndefined();
    expect(mockLogFailure).toHaveBeenCalled();
  });

  it("logs the individual notification failure but continues", async () => {
    mockProjects.mockResolvedValueOnce([{ id: 1, project_title: "A" }] as any);
    mockSend.mockRejectedValueOnce(new Error("email down"));

    await notifyRoleChangedEditorToAdmin({
      userId: 7,
      actorId: 9,
      organizationId: 99,
      functionName: "test",
      fileName: "test.ts",
      loggerUserId: 9,
    });

    // wait a microtask for the catch to fire
    await new Promise((r) => setImmediate(r));
    expect(mockLogFailure).toHaveBeenCalled();
  });
});
