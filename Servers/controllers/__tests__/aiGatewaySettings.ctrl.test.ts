import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/aiGatewayInternal.utils", () => {
  class AiGatewayError extends Error {
    constructor(
      public readonly status: number,
      public readonly body: unknown,
      message: string,
    ) {
      super(message);
    }
  }
  return { AiGatewayError, aiGatewayRequest: jest.fn<any>() };
});
jest.mock("../../utils/auditLedger.utils", () => ({ appendToAuditLedger: jest.fn<any>() }));
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
  logProcessing: jest.fn<any>(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn<any>().mockResolvedValue(false),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import {
  describeRetentionChanges,
  isRetentionOnlyUpdate,
  updateGuardrailSettings,
} from "../aiGatewaySettings.ctrl";
import { AiGatewayError, aiGatewayRequest } from "../../utils/aiGatewayInternal.utils";
import { appendToAuditLedger } from "../../utils/auditLedger.utils";
import { logFailure, logProcessing, logSuccess } from "../../utils/logger/logHelper";
import { roleHasPermission } from "../../utils/rolePermissions.utils";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

function createReq(body: Record<string, any>, role = "Admin"): any {
  return { userId: 5, organizationId: 2, role, body, requestId: "req-1" };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  res.send = jest.fn<any>().mockReturnValue(res);
  return res;
}

/**
 * The gateway's PUT returns `after` plus `previous_retention`, the values the
 * save replaced (`before.settings`; null when the org had none). PUT throws
 * `after` when it is an Error.
 */
function gateway(before: unknown, after: unknown) {
  m(aiGatewayRequest).mockImplementation(async () => {
    if (after instanceof Error) throw after;
    return {
      ...(after as object),
      previous_retention: (before as { settings?: unknown } | null)?.settings ?? null,
    };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  m(roleHasPermission).mockResolvedValue(false);
});

function putRole(): string | undefined {
  const put = m(aiGatewayRequest).mock.calls.find((call: any[]) => call[0] === "PUT");
  return put?.[2]?.role;
}

describe("updateGuardrailSettings role sent to the gateway", () => {
  const after = { settings: { log_retention_days: 30 } };

  it("sends Admin for a retention-only save by a custom role holding organization.admin", async () => {
    gateway({ settings: {} }, after);
    m(roleHasPermission).mockResolvedValue(true);

    await updateGuardrailSettings(
      createReq({ log_retention_days: 30, auto_purge_enabled: true }, "Compliance lead"),
      createRes(),
    );

    expect(m(roleHasPermission)).toHaveBeenCalledWith(2, "Compliance lead", "organization.admin");
    expect(putRole()).toBe("Admin");
  });

  it("keeps the caller's role when the save includes a non-retention setting", async () => {
    gateway({ settings: {} }, after);
    m(roleHasPermission).mockResolvedValue(true);

    await updateGuardrailSettings(
      createReq({ log_retention_days: 30, pii_on_error: "allow" }, "Compliance lead"),
      createRes(),
    );

    expect(putRole()).toBe("Compliance lead");
  });

  it("keeps the caller's role when the role lacks organization.admin", async () => {
    gateway({ settings: {} }, after);

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }, "Editor"), createRes());

    expect(putRole()).toBe("Editor");
  });

  it("does not elevate an elected SuperAdmin whose org role is Editor", async () => {
    gateway({ settings: {} }, after);

    await updateGuardrailSettings(
      { ...createReq({ log_retention_days: 30 }, "Editor"), isSuperAdmin: true },
      createRes(),
    );

    expect(putRole()).toBe("Editor");
  });

  it("keeps the caller's role when the permission lookup fails", async () => {
    gateway({ settings: {} }, after);
    m(roleHasPermission).mockRejectedValue(new Error("db down"));
    const res = createRes();

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }, "Compliance lead"), res);

    expect(putRole()).toBe("Compliance lead");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not look up permissions for a built-in Admin", async () => {
    gateway({ settings: {} }, after);

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), createRes());

    expect(m(roleHasPermission)).not.toHaveBeenCalled();
    expect(putRole()).toBe("Admin");
  });
});

describe("updateGuardrailSettings", () => {
  it("forwards the body with the caller's org, role and user and returns the gateway's body", async () => {
    const after = { settings: { log_retention_days: 30, spend_log_retention_days: 90 } };
    gateway({ settings: { log_retention_days: 90, spend_log_retention_days: 90 } }, after);
    const res = createRes();

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), res);

    // No separate read: the "from" values come back with the save.
    expect(m(aiGatewayRequest)).toHaveBeenCalledTimes(1);
    expect(m(aiGatewayRequest)).toHaveBeenCalledWith("PUT", "/internal/guardrails/settings", {
      organizationId: 2,
      role: "Admin",
      userId: 5,
      requestId: "req-1",
      body: { log_retention_days: 30 },
      timeoutMs: 30_000,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(after);
    expect(m(logProcessing)).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "updateGuardrailSettings", organizationId: 2 }),
    );
    expect(m(logSuccess)).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "Update", organizationId: 2 }),
    );
  });

  it("describes only the retention keys the request set", async () => {
    // The stored auto-purge value differs too, but the request did not set it.
    gateway(
      { settings: { log_retention_days: 90, auto_purge_enabled: false } },
      { settings: { log_retention_days: 30, auto_purge_enabled: true } },
    );

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), createRes());

    expect(m(appendToAuditLedger)).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "AI Gateway retention changed: guardrail log retention from 90 days to 30 days",
      }),
    );
  });

  it("appends one ledger entry describing every retention change", async () => {
    gateway(
      {
        settings: {
          log_retention_days: 90,
          spend_log_retention_days: 60,
          auto_purge_enabled: false,
        },
      },
      {
        settings: {
          log_retention_days: 30,
          spend_log_retention_days: 60,
          auto_purge_enabled: true,
        },
      },
    );

    await updateGuardrailSettings(
      createReq({ log_retention_days: 30, spend_log_retention_days: 60, auto_purge_enabled: true }),
      createRes(),
    );

    expect(m(appendToAuditLedger)).toHaveBeenCalledTimes(1);
    expect(m(appendToAuditLedger)).toHaveBeenCalledWith({
      organizationId: 2,
      entryType: "event_log",
      userId: 5,
      eventType: "Update",
      entityType: "data_retention",
      description:
        "AI Gateway retention changed: guardrail log retention from 90 days to 30 days; automatic deletion from off to on",
    });
  });

  it("uses the gateway defaults when the org has no saved settings", async () => {
    gateway({ settings: null }, { settings: { spend_log_retention_days: 30 } });

    await updateGuardrailSettings(createReq({ spend_log_retention_days: 30 }), createRes());

    expect(m(appendToAuditLedger)).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "AI Gateway retention changed: spend log retention from 90 days to 30 days",
      }),
    );
  });

  it("appends nothing when only non-retention settings change", async () => {
    gateway(
      { settings: { log_retention_days: 90, pii_on_error: "block" } },
      { settings: { log_retention_days: 90, pii_on_error: "allow" } },
    );

    await updateGuardrailSettings(createReq({ pii_on_error: "allow" }), createRes());

    expect(m(appendToAuditLedger)).not.toHaveBeenCalled();
  });

  it("passes a gateway error status and body through unchanged", async () => {
    gateway(
      { settings: {} },
      new AiGatewayError(400, { detail: "log_retention_days must be a positive integer" }, "x"),
    );
    const res = createRes();

    await updateGuardrailSettings(createReq({ log_retention_days: 0 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      detail: "log_retention_days must be a positive integer",
    });
    expect(m(appendToAuditLedger)).not.toHaveBeenCalled();
    // A validation rejection is the caller's error, not a server failure.
    expect(m(logFailure)).not.toHaveBeenCalled();
  });

  it("appends nothing when the request set no retention key", async () => {
    gateway(
      { settings: { log_retention_days: 90 } },
      { settings: { log_retention_days: 90, pii_on_error: "allow" } },
    );

    await updateGuardrailSettings(createReq({ pii_on_error: "allow" }), createRes());

    expect(m(appendToAuditLedger)).not.toHaveBeenCalled();
  });

  it("appends nothing when a retention key was sent unchanged", async () => {
    gateway({ settings: { log_retention_days: 30 } }, { settings: { log_retention_days: 30 } });

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), createRes());

    expect(m(appendToAuditLedger)).not.toHaveBeenCalled();
  });

  it("passes the gateway's admin check through for a non-admin", async () => {
    gateway({ settings: {} }, new AiGatewayError(403, { detail: "Admin role required" }, "x"));
    const res = createRes();

    await updateGuardrailSettings(createReq({ auto_purge_enabled: true }, "Editor"), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ detail: "Admin role required" });
  });

  it("returns 502 when the gateway cannot be reached", async () => {
    gateway(new Error("ECONNREFUSED"), new Error("ECONNREFUSED"));
    const res = createRes();

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(m(logFailure)).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "Update", functionName: "updateGuardrailSettings" }),
    );
  });

  it("still saves and records the new value as set when the read fails", async () => {
    m(aiGatewayRequest).mockImplementation(async (method: string) => {
      if (method === "GET") throw new Error("timeout");
      return { settings: { log_retention_days: 30 } };
    });
    const res = createRes();

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(m(appendToAuditLedger)).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "AI Gateway retention changed: guardrail log retention set to 30 days",
      }),
    );
  });

  it("says 'set to' when the gateway does not return the previous values", async () => {
    m(aiGatewayRequest).mockResolvedValue({ settings: { log_retention_days: 30 } });
    const res = createRes();

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), res);

    expect(m(appendToAuditLedger)).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "AI Gateway retention changed: guardrail log retention set to 30 days",
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ settings: { log_retention_days: 30 } });
  });

  it("does not pass previous_retention on to the client", async () => {
    gateway({ settings: { log_retention_days: 90 } }, { settings: { log_retention_days: 30 } });
    const res = createRes();

    await updateGuardrailSettings(createReq({ log_retention_days: 30 }), res);

    expect(res.json).toHaveBeenCalledWith({ settings: { log_retention_days: 30 } });
  });

  describe("Agent Control deployment default in the ledger", () => {
    const CONFIG_PATH = "/internal/retention/config";
    const mockAgentSave = (config: () => Promise<unknown>) =>
      m(aiGatewayRequest).mockImplementation(async (method: string, path: string) => {
        if (method === "GET" && path === CONFIG_PATH) return config();
        return {
          settings: { mcp_audit_retention_days: null },
          previous_retention: { mcp_audit_retention_days: 60 },
        };
      });

    it("reads the deployment default and records its days", async () => {
      mockAgentSave(async () => ({
        mcp_audit_retention_days: 30,
        mcp_audit_retention_min_days: 7,
      }));
      const res = createRes();

      await updateGuardrailSettings(createReq({ mcp_audit_retention_days: null }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(m(appendToAuditLedger)).toHaveBeenCalledWith(
        expect.objectContaining({
          description:
            "AI Gateway retention changed: Agent Control log retention from 60 days to the deployment default (30 days)",
        }),
      );
    });

    it("falls back to the plain wording when the config read fails", async () => {
      mockAgentSave(async () => {
        throw new Error("timeout");
      });
      const res = createRes();

      await updateGuardrailSettings(createReq({ mcp_audit_retention_days: null }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(m(appendToAuditLedger)).toHaveBeenCalledWith(
        expect.objectContaining({
          description:
            "AI Gateway retention changed: Agent Control log retention from 60 days to the deployment default",
        }),
      );
    });

    it("does not read the config when the request has no Agent Control period", async () => {
      gateway({ settings: { log_retention_days: 90 } }, { settings: { log_retention_days: 30 } });
      const res = createRes();

      await updateGuardrailSettings(createReq({ log_retention_days: 30 }), res);

      const paths = m(aiGatewayRequest).mock.calls.map((call: any[]) => call[1]);
      expect(paths).not.toContain(CONFIG_PATH);
    });
  });

  it("logs a failed ledger append and still succeeds", async () => {
    gateway(
      { settings: { auto_purge_enabled: false } },
      { settings: { auto_purge_enabled: true } },
    );
    m(appendToAuditLedger).mockRejectedValue(new Error("ledger down"));
    const res = createRes();

    await updateGuardrailSettings(createReq({ auto_purge_enabled: true }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(m(logFailure)).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "Update", organizationId: 2 }),
    );
  });
});

describe("describeRetentionChanges", () => {
  it("ignores keys the gateway did not return", () => {
    expect(
      describeRetentionChanges({ log_retention_days: 90 }, {}, { log_retention_days: 30 }),
    ).toEqual([]);
  });

  it("writes 'set to' for every requested key when the old values are unknown", () => {
    expect(
      describeRetentionChanges(
        null,
        { log_retention_days: 30, auto_purge_enabled: false, spend_log_retention_days: 90 },
        { log_retention_days: 30, auto_purge_enabled: false },
      ),
    ).toEqual(["guardrail log retention set to 30 days", "automatic deletion set to off"]);
  });
  it("describes an Agent Control period change and a reset to the default", () => {
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: 60 },
        { mcp_audit_retention_days: 60 },
      ),
    ).toEqual(["Agent Control log retention from the deployment default to 60 days"]);
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: 60 },
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: null },
      ),
    ).toEqual(["Agent Control log retention from 60 days to the deployment default"]);
  });

  it("names the deployment default's days when they are known", () => {
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: 60 },
        { mcp_audit_retention_days: 60 },
        30,
      ),
    ).toEqual(["Agent Control log retention from the deployment default (30 days) to 60 days"]);
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: 60 },
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: null },
        30,
      ),
    ).toEqual(["Agent Control log retention from 60 days to the deployment default (30 days)"]);
  });

  it("describes a deployment default of 0 or less as kept indefinitely", () => {
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: 60 },
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: null },
        0,
      ),
    ).toEqual([
      "Agent Control log retention from 60 days to the deployment default (kept indefinitely)",
    ]);
  });

  it("skips an unchanged Agent Control default", () => {
    expect(
      describeRetentionChanges(
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: null },
        { mcp_audit_retention_days: null },
      ),
    ).toEqual([]);
  });
});

describe("isRetentionOnlyUpdate", () => {
  it("treats an Agent Control-only save as retention-only", () => {
    expect(isRetentionOnlyUpdate({ mcp_audit_retention_days: 30 })).toBe(true);
  });
  it("accepts only retention keys", () => {
    expect(isRetentionOnlyUpdate({ log_retention_days: 30, auto_purge_enabled: true })).toBe(true);
    expect(isRetentionOnlyUpdate({})).toBe(false);
    expect(isRetentionOnlyUpdate({ log_retention_days: 30, pii_on_error: "allow" })).toBe(false);
  });

  it("does not treat inherited property names as retention keys", () => {
    expect(isRetentionOnlyUpdate({ log_retention_days: 30, constructor: 1 })).toBe(false);
    expect(isRetentionOnlyUpdate(JSON.parse('{"log_retention_days":30,"__proto__":1}'))).toBe(
      false,
    );
    expect(isRetentionOnlyUpdate({ toString: 1 })).toBe(false);
  });
});
