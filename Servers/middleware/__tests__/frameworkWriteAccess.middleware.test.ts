import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { BUILTIN_ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

// Built-in roles resolve against the real matrix; "Custom: a,b" is a custom
// role holding exactly the listed keys.
jest.mock("../../utils/rolePermissions.utils", () => ({
  requestHasPermission: jest.fn(async (req: any, key: string) => {
    const role: string = req.role;
    if (role.startsWith("Custom:")) {
      return role
        .slice("Custom:".length)
        .split(",")
        .map((k) => k.trim())
        .includes(key);
    }
    return BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false;
  }),
}));

import { requireFrameworkWriteAccess } from "../frameworkWriteAccess.middleware";
import type { FrameworkChanges } from "../../utils/frameworkWriteAccess.utils";

const run = async (role: string | undefined, changes: FrameworkChanges) => {
  const detect = jest.fn(async () => changes);
  const req: any = { role, organizationId: 1, t: (key: string) => key };
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  const next = jest.fn();
  await requireFrameworkWriteAccess(detect)(req, res, next);
  return { detect, res, next, status: (res.status as jest.Mock).mock.calls[0]?.[0] };
};

const NONE = { edit: false, audit: false };
const EDIT = { edit: true, audit: false };
const AUDIT = { edit: false, audit: true };
const BOTH = { edit: true, audit: true };

describe("requireFrameworkWriteAccess", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a role", async () => {
    const { status, next } = await run(undefined, NONE);
    expect(status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  describe("built-in roles keep today's behavior", () => {
    it.each(["Admin", "Editor"])("%s saves anything without a lookup", async (role) => {
      const { next, detect } = await run(role, BOTH);
      expect(next).toHaveBeenCalled();
      expect(detect).not.toHaveBeenCalled();
    });

    it("Auditor records audit results", async () => {
      expect((await run("Auditor", AUDIT)).next).toHaveBeenCalled();
    });

    it("Auditor's unchanged save passes", async () => {
      expect((await run("Auditor", NONE)).next).toHaveBeenCalled();
    });

    it("Auditor cannot change implementation fields or evidence", async () => {
      const { status, next } = await run("Auditor", EDIT);
      expect(status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("Reviewer's unchanged save passes", async () => {
      expect((await run("Reviewer", NONE)).next).toHaveBeenCalled();
    });

    it.each([EDIT, AUDIT])("Reviewer cannot change framework content (%o)", async (changes) => {
      expect((await run("Reviewer", changes)).status).toBe(403);
    });
  });

  describe("custom roles", () => {
    it("denied both keys: 403 on any change", async () => {
      expect((await run("Custom: risks.edit", EDIT)).status).toBe(403);
      expect((await run("Custom: risks.edit", AUDIT)).status).toBe(403);
    });

    it("framework.edit only: edits pass, audit results are refused", async () => {
      expect((await run("Custom: framework.edit", EDIT)).next).toHaveBeenCalled();
      expect((await run("Custom: framework.edit", AUDIT)).status).toBe(403);
    });

    it("framework.audit only: audit results pass, edits are refused", async () => {
      expect((await run("Custom: framework.audit", AUDIT)).next).toHaveBeenCalled();
      expect((await run("Custom: framework.audit", BOTH)).status).toBe(403);
    });

    it("both keys: passes without a lookup", async () => {
      const { next, detect } = await run("Custom: framework.edit, framework.audit", BOTH);
      expect(next).toHaveBeenCalled();
      expect(detect).not.toHaveBeenCalled();
    });
  });

  it("passes detector errors to the error handler", async () => {
    const req: any = { role: "Auditor", organizationId: 1, t: (k: string) => k };
    const res: any = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    const error = new Error("db down");
    await requireFrameworkWriteAccess(async () => {
      throw error;
    })(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
