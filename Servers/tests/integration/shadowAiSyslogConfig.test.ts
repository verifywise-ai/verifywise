// Rule evaluation is not under test and would race afterEach's TRUNCATE.
jest.mock("../../services/shadowAiAlertNotification.service", () => ({
  ...jest.requireActual("../../services/shadowAiAlertNotification.service"),
  evaluateRulesForBatch: jest.fn().mockResolvedValue(undefined),
}));

import path from "path";
import { createTestApp, testRequest } from "./setup";
import { createTestOrganization, cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { SOURCE_KEY_RE, hashSourceKey } from "../../services/shadowAiSyslog/sourceKey";
import { listActiveSyslogSourcesQuery } from "../../utils/shadowAiConfig.utils";

const BASE = "/api/shadow-ai/config/syslog";

/**
 * Syslog sources carry a secret key and listener stats. Covers the Admin API
 * for creating and regenerating keys, the sender-IP validation, role gating,
 * tenant scoping, the listener status endpoint and the migration.
 */
describe("Shadow AI syslog source keys and status", () => {
  let orgA: number;
  let orgB: number;
  const envBackup = { ...process.env };

  const as = async (organizationId: number, role = "Admin") =>
    testRequest(
      await createTestApp({ bypassAuth: true, mockUser: { userId: 1, role, organizationId } }),
    );

  const rowFor = async (id: number) => {
    const [rows] = await sequelize.query(`SELECT * FROM shadow_ai_syslog_config WHERE id = :id`, {
      replacements: { id },
    });
    return (rows as Record<string, unknown>[])[0];
  };

  beforeEach(async () => {
    orgA = await createTestOrganization("Syslog A");
    orgB = await createTestOrganization("Syslog B");
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    await cleanupDatabase();
  });

  const create = async (org: number, body: Record<string, unknown> = {}) => {
    const api = await as(org);
    return api.post(BASE).send({ parser_type: "squid", ...body });
  };

  it("returns the key once on create and stores only its hash", async () => {
    const res = await create(orgA, { source_identifier: "10.0.0.5" });
    expect(res.status).toBe(201);
    const { key, id } = res.body.data;
    expect(key).toMatch(SOURCE_KEY_RE);
    expect(res.body.data).not.toHaveProperty("key_hash");
    expect(res.body.data.key_prefix).toBe(key.slice(0, 16));
    expect(res.body.data.events_accepted).toBeDefined();

    const row = await rowFor(id);
    expect(row.key_hash).toBe(hashSourceKey(key));
    expect(JSON.stringify(row)).not.toContain(key);
  });

  it("lists sources with the prefix and never the key or hash", async () => {
    await create(orgA, { source_identifier: "10.0.0.5" });
    const api = await as(orgA);
    const res = await api.get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const [item] = res.body.data;
    expect(item.key_prefix).toMatch(/^vwsl_\d+_/);
    expect(item).not.toHaveProperty("key");
    expect(item).not.toHaveProperty("key_hash");
    expect(item.last_event_at).toBeNull();
    expect(Number(item.events_accepted)).toBe(0);
    expect(Number(item.events_dropped)).toBe(0);
    expect(item.last_drop_reason).toBeNull();
  });

  it("creates a source without a sender IP", async () => {
    const res = await create(orgA);
    expect(res.status).toBe(201);
    expect(res.body.data.source_identifier).toBeNull();
    expect(res.body.data.key).toMatch(SOURCE_KEY_RE);
  });

  it("regenerates the key and drops the old hash", async () => {
    const created = await create(orgA, { source_identifier: "10.0.0.5" });
    const { id, key: oldKey } = created.body.data;
    const api = await as(orgA);
    const res = await api.post(`${BASE}/${id}/regenerate-key`);
    expect(res.status).toBe(200);
    expect(res.body.data.key).toMatch(SOURCE_KEY_RE);
    expect(res.body.data.key).not.toBe(oldKey);
    expect(res.body.data).not.toHaveProperty("key_hash");

    const row = await rowFor(id);
    expect(row.key_hash).toBe(hashSourceKey(res.body.data.key));
    expect(row.key_hash).not.toBe(hashSourceKey(oldKey));
  });

  it("returns 404 when another organization regenerates the key", async () => {
    const created = await create(orgA, { source_identifier: "10.0.0.5" });
    const { id } = created.body.data;
    const api = await as(orgB);
    const res = await api.post(`${BASE}/${id}/regenerate-key`);
    expect(res.status).toBe(404);
    const row = await rowFor(id);
    expect(row.key_hash).toBe(hashSourceKey(created.body.data.key));
  });

  it("stores the sender IP normalised", async () => {
    const res = await create(orgA, { source_identifier: "::ffff:10.0.0.9" });
    expect(res.status).toBe(201);
    expect(res.body.data.source_identifier).toBe("10.0.0.9");
  });

  it("rejects a hostname as sender IP on create", async () => {
    const res = await create(orgA, { source_identifier: "proxy-01.corp.com" });
    expect(res.status).toBe(400);
  });

  it("clears the sender IP with an empty string or null", async () => {
    const created = await create(orgA, { source_identifier: "10.0.0.5" });
    const api = await as(orgA);
    const emptied = await api
      .patch(`${BASE}/${created.body.data.id}`)
      .send({ source_identifier: "" });
    expect(emptied.status).toBe(200);
    expect(emptied.body.data.source_identifier).toBeNull();

    await api.patch(`${BASE}/${created.body.data.id}`).send({ source_identifier: "10.0.0.6" });
    const nulled = await api
      .patch(`${BASE}/${created.body.data.id}`)
      .send({ source_identifier: null });
    expect(nulled.status).toBe(200);
    expect(nulled.body.data.source_identifier).toBeNull();
  });

  it("normalises the sender IP on update and never returns the hash", async () => {
    const created = await create(orgA);
    const api = await as(orgA);
    const res = await api
      .patch(`${BASE}/${created.body.data.id}`)
      .send({ source_identifier: "::ffff:10.0.0.7" });
    expect(res.status).toBe(200);
    expect(res.body.data.source_identifier).toBe("10.0.0.7");
    expect(res.body.data).not.toHaveProperty("key_hash");
  });

  describe("legacy rows with a hostname identifier", () => {
    let legacyId: number;

    beforeEach(async () => {
      const [rows] = await sequelize.query(
        `INSERT INTO shadow_ai_syslog_config (organization_id, source_identifier, parser_type, is_active)
         VALUES (:orgA, 'proxy-01.corp.com', 'squid', true) RETURNING id`,
        { replacements: { orgA } },
      );
      legacyId = (rows as { id: number }[])[0].id;
    });

    it("can be deactivated without touching the identifier", async () => {
      const api = await as(orgA);
      const res = await api.patch(`${BASE}/${legacyId}`).send({ is_active: false });
      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(false);
      expect(res.body.data.source_identifier).toBe("proxy-01.corp.com");
    });

    it("rejects re-sending the hostname as the identifier", async () => {
      const api = await as(orgA);
      const res = await api
        .patch(`${BASE}/${legacyId}`)
        .send({ source_identifier: "proxy-01.corp.com" });
      expect(res.status).toBe(400);
    });

    it("can mint a key through regenerate", async () => {
      const api = await as(orgA);
      const res = await api.post(`${BASE}/${legacyId}/regenerate-key`);
      expect(res.status).toBe(200);
      expect(res.body.data.key).toMatch(SOURCE_KEY_RE);
    });
  });

  it("allows several legacy rows without a key hash", async () => {
    await sequelize.query(
      `INSERT INTO shadow_ai_syslog_config (organization_id, source_identifier, parser_type)
       VALUES (:orgA, 'a', 'squid'), (:orgA, 'b', 'squid')`,
      { replacements: { orgA } },
    );
    const [rows] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM shadow_ai_syslog_config WHERE key_hash IS NULL`,
    );
    expect((rows as { n: number }[])[0].n).toBe(2);
  });

  it.each(["Editor", "Reviewer", "Auditor"])("returns 403 on all routes for %s", async (role) => {
    const created = await create(orgA, { source_identifier: "10.0.0.5" });
    const { id } = created.body.data;
    const api = await as(orgA, role);
    expect((await api.get(BASE)).status).toBe(403);
    expect((await api.post(BASE).send({ parser_type: "squid" })).status).toBe(403);
    expect((await api.post(`${BASE}/${id}/regenerate-key`)).status).toBe(403);
    expect((await api.get(`${BASE}/status`)).status).toBe(403);
    expect((await api.patch(`${BASE}/${id}`).send({ is_active: false })).status).toBe(403);
    expect((await api.delete(`${BASE}/${id}`)).status).toBe(403);
  });

  describe("GET /config/syslog/status", () => {
    it("reports defaults when nothing is configured", async () => {
      for (const k of Object.keys(process.env)) {
        if (k.startsWith("SHADOW_AI_SYSLOG_")) delete process.env[k];
      }
      const api = await as(orgA);
      const res = await api.get(`${BASE}/status`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        enabled: false,
        port: 6514,
        tls: false,
        plaintext: false,
        ipOnly: false,
        // The test process never starts the listener.
        running: false,
        startError: null,
      });
    });

    it("reflects the environment", async () => {
      process.env.SHADOW_AI_SYSLOG_ENABLED = "true";
      process.env.SHADOW_AI_SYSLOG_PORT = "7000";
      process.env.SHADOW_AI_SYSLOG_TLS_CERT_FILE = "/etc/cert.pem";
      process.env.SHADOW_AI_SYSLOG_TLS_KEY_FILE = "/etc/key.pem";
      process.env.SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT = "true";
      process.env.SHADOW_AI_SYSLOG_ALLOW_IP_ONLY = "true";
      const api = await as(orgA);
      const res = await api.get(`${BASE}/status`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        enabled: true,
        port: 7000,
        tls: true,
        plaintext: true,
        ipOnly: true,
        // The test process never starts the listener.
        running: false,
        startError: null,
      });
    });

    it("does not report TLS when only the certificate is set", async () => {
      process.env.SHADOW_AI_SYSLOG_TLS_CERT_FILE = "/etc/cert.pem";
      delete process.env.SHADOW_AI_SYSLOG_TLS_KEY_FILE;
      const api = await as(orgA);
      const res = await api.get(`${BASE}/status`);
      expect(res.body.data.tls).toBe(false);
    });
  });

  it("lists active sources across organizations for the listener", async () => {
    const a = await create(orgA, { source_identifier: "10.0.0.5" });
    const b = await create(orgB);
    await create(orgB, { is_active: false });
    const spy = jest.spyOn(sequelize, "query");
    let rows: Awaited<ReturnType<typeof listActiveSyslogSourcesQuery>>;
    try {
      rows = await listActiveSyslogSourcesQuery();
      // One cross-organization SELECT, not a statement pair per organization.
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect(rows.map((r) => r.id).sort()).toEqual([a.body.data.id, b.body.data.id].sort());
    const first = rows.find((r) => r.id === a.body.data.id)!;
    expect(first.organization_id).toBe(orgA);
    expect(first.key_hash).toBe(hashSourceKey(a.body.data.key));
  });

  describe("migration", () => {
    const migration = () =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(
        path.resolve(
          __dirname,
          "../../database/migrations/20261102120000-shadow-ai-syslog-source-keys.js",
        ),
      );

    it("keeps a legacy row through down then up", async () => {
      const [ins] = await sequelize.query(
        `INSERT INTO shadow_ai_syslog_config (organization_id, source_identifier, parser_type)
         VALUES (:orgA, 'proxy-01.corp.com', 'squid') RETURNING id`,
        { replacements: { orgA } },
      );
      const id = (ins as { id: number }[])[0].id;
      const qi = sequelize.getQueryInterface();

      await migration().down(qi);
      const [cols] = await sequelize.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'verifywise' AND table_name = 'shadow_ai_syslog_config'`,
      );
      expect((cols as { column_name: string }[]).map((c) => c.column_name)).not.toContain(
        "key_hash",
      );

      await migration().up(qi);
      const row = await rowFor(id);
      expect(row.source_identifier).toBe("proxy-01.corp.com");
      expect(row.key_hash).toBeNull();
      expect(Number(row.events_accepted)).toBe(0);
    });
  });
});
