// Rule evaluation is not under test and would race afterEach's TRUNCATE.
jest.mock("../../services/shadowAiAlertNotification.service", () => ({
  ...jest.requireActual("../../services/shadowAiAlertNotification.service"),
  evaluateRulesForBatch: jest.fn().mockResolvedValue(undefined),
}));

import "./setup";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import tls from "tls";
import { execFileSync } from "child_process";
import { createTestOrganization, cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import * as configUtils from "../../utils/shadowAiConfig.utils";
import {
  createSyslogConfigQuery,
  deleteSyslogConfigQuery,
  regenerateSyslogKeyQuery,
  updateSyslogConfigQuery,
} from "../../utils/shadowAiConfig.utils";
import { invalidateSourceCache } from "../../services/shadowAiSyslog/sourceCache";
import { hashSourceKey } from "../../services/shadowAiSyslog/sourceKey";
import { startSyslogListener, SyslogListenerHandle } from "../../services/shadowAiSyslog/listener";
import { SyslogListenerConfig } from "../../services/shadowAiSyslog/config";
import { evaluateRulesForBatch } from "../../services/shadowAiAlertNotification.service";

const ZSCALER_LINE =
  "user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed";
const SQUID_DASH_USER =
  "1707489120.000 200 10.0.0.1 TCP_TUNNEL/200 0 CONNECT chat.openai.com:443 - HIER_DIRECT/1.2.3.4";

const baseConfig: SyslogListenerConfig = {
  enabled: true,
  port: 0,
  allowPlaintext: true,
  allowIpOnly: false,
  multiTenancy: false,
};

const clients = new Set<net.Socket>();
// Trust the test's own self-signed certificate; it is issued for "localhost".
let testCa: Buffer;
const tlsClientOptions = () => ({
  ca: testCa,
  servername: "localhost",
  checkServerIdentity: () => undefined,
});

function connect(port: number, useTls: boolean): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = useTls
      ? tls.connect({ host: "127.0.0.1", port, ...tlsClientOptions() }, () => resolve(socket))
      : net.connect({ host: "127.0.0.1", port }, () => resolve(socket));
    clients.add(socket);
    socket.on("error", reject);
    socket.on("close", () => clients.delete(socket));
  });
}

const waitForClose = (socket: net.Socket, ms = 5000): Promise<boolean> =>
  new Promise((resolve) => {
    if (socket.destroyed) return resolve(true);
    const timer = setTimeout(() => resolve(false), ms);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Write each chunk separately, end the connection and wait until it closes. */
async function send(port: number, chunks: string[], useTls = false): Promise<void> {
  const socket = await connect(port, useTls);
  socket.on("error", () => undefined);
  for (const chunk of chunks) {
    await new Promise<void>((resolve) => socket.write(chunk, () => resolve()));
    if (chunks.length > 1) await pause(50);
  }
  socket.end();
  await waitForClose(socket);
}

describe("Shadow AI syslog listener", () => {
  let orgA: number;
  let orgB: number;
  let handle: SyslogListenerHandle | null = null;
  let tlsDir: string;
  let certFile: string;
  let keyFile: string;

  const eventCount = async (org: number): Promise<number> => {
    const [rows] = await sequelize.query(
      "SELECT COUNT(*)::int AS n FROM shadow_ai_events WHERE organization_id = :org",
      { replacements: { org } },
    );
    return (rows as { n: number }[])[0].n;
  };

  const toolCount = async (org: number): Promise<number> => {
    const [rows] = await sequelize.query(
      "SELECT COUNT(*)::int AS n FROM shadow_ai_tools WHERE organization_id = :org",
      { replacements: { org } },
    );
    return (rows as { n: number }[])[0].n;
  };

  const sourceRow = async (id: number) => {
    const [rows] = await sequelize.query(
      `SELECT events_accepted, events_dropped, last_event_at, last_drop_reason
         FROM shadow_ai_syslog_config WHERE id = :id`,
      { replacements: { id } },
    );
    const row = (rows as Record<string, unknown>[])[0];
    return {
      accepted: Number(row.events_accepted),
      dropped: Number(row.events_dropped),
      lastEventAt: row.last_event_at,
      lastDropReason: row.last_drop_reason,
    };
  };

  const addSource = async (
    org: number,
    parser = "zscaler",
    allowedIp: string | null = null,
  ): Promise<{ id: number; key: string }> => {
    const { config, key } = await createSyslogConfigQuery(org, {
      source_identifier: allowedIp,
      parser_type: parser,
      is_active: true,
    });
    invalidateSourceCache();
    return { id: config.id as number, key };
  };

  const start = async (cfg: Partial<SyslogListenerConfig> = {}) => {
    handle = await startSyslogListener({ ...baseConfig, ...cfg });
    if (!handle) throw new Error("listener did not start");
    return handle;
  };

  beforeAll(() => {
    tlsDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-syslog-tls-"));
    keyFile = path.join(tlsDir, "key.pem");
    certFile = path.join(tlsDir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-subj",
        "/CN=localhost",
        "-days",
        "1",
        "-keyout",
        keyFile,
        "-out",
        certFile,
      ],
      { stdio: "ignore" },
    );
    testCa = fs.readFileSync(certFile);
  });

  afterAll(() => {
    fs.rmSync(tlsDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    orgA = await createTestOrganization("Syslog listener A");
    orgB = await createTestOrganization("Syslog listener B");
    invalidateSourceCache();
  });

  afterEach(async () => {
    for (const socket of clients) socket.destroy();
    clients.clear();
    if (handle) await handle.close();
    handle = null;
    invalidateSourceCache();
    await cleanupDatabase();
  });

  it("returns null when disabled", async () => {
    expect(await startSyslogListener({ ...baseConfig, enabled: false })).toBeNull();
  });

  it("refuses IP-only mode when multi-tenancy is on", async () => {
    await expect(
      startSyslogListener({ ...baseConfig, allowIpOnly: true, multiTenancy: true }),
    ).rejects.toThrow(/MULTI_TENANCY_ENABLED/);
  });

  it("refuses to start with neither TLS nor plaintext", async () => {
    await expect(startSyslogListener({ ...baseConfig, allowPlaintext: false })).rejects.toThrow(
      /TLS/,
    );
  });

  describe.each([
    ["plain TCP", false],
    ["TLS", true],
  ])("over %s", (_label, useTls) => {
    const startFor = () =>
      start(useTls ? { allowPlaintext: false, tlsCertFile: certFile, tlsKeyFile: keyFile } : {});

    it("routes a line with org A's key to org A only", async () => {
      const a = await addSource(orgA);
      await addSource(orgB);
      const h = await startFor();

      await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`], useTls);
      await h.flushAll();

      expect(await eventCount(orgA)).toBe(1);
      expect(await eventCount(orgB)).toBe(0);
      expect(await toolCount(orgA)).toBeGreaterThanOrEqual(1);
      const row = await sourceRow(a.id);
      expect(row.accepted).toBe(1);
      expect(row.lastEventAt).not.toBeNull();
    });

    it("hands rule evaluation the batch's first event id and its AI-only emails", async () => {
      const a = await addSource(orgA);
      const h = await startFor();
      (evaluateRulesForBatch as jest.Mock).mockClear();

      await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`], useTls);
      await h.flushAll();

      const [orgId, batch] = (evaluateRulesForBatch as jest.Mock).mock.calls[0];
      const [[row]] = (await sequelize.query(
        `SELECT MIN(id) AS id FROM shadow_ai_events WHERE organization_id = :orgId`,
        { replacements: { orgId: orgA } },
      )) as [Array<{ id: string }>, unknown];
      expect(orgId).toBe(orgA);
      expect(batch.firstEventId).toBe(Number(row.id));
      expect([...batch.allEmails]).toEqual(["alice@company.com"]);
    });

    it("routes a line with org B's key to org B only", async () => {
      await addSource(orgA);
      const b = await addSource(orgB);
      const h = await startFor();

      await send(h.port, [`vw_source=${b.key} ${ZSCALER_LINE}\n`], useTls);
      await h.flushAll();

      expect(await eventCount(orgA)).toBe(0);
      expect(await eventCount(orgB)).toBe(1);
    });

    it("routes each line of one connection to its own organization", async () => {
      const a = await addSource(orgA);
      const b = await addSource(orgB);
      const h = await startFor();

      await send(
        h.port,
        [
          `${ZSCALER_LINE} vw_source=${a.key}\n${ZSCALER_LINE} vw_source=${b.key}\n` +
            `${ZSCALER_LINE} vw_source=${a.key}\n`,
        ],
        useTls,
      );
      await h.flushAll();

      expect(await eventCount(orgA)).toBe(2);
      expect(await eventCount(orgB)).toBe(1);
      expect((await sourceRow(a.id)).accepted).toBe(2);
      expect((await sourceRow(b.id)).accepted).toBe(1);
    });
  });

  it("refuses a TLS handshake when TLS is not configured", async () => {
    const h = await start();
    const socket = tls.connect({ host: "127.0.0.1", port: h.port, ...tlsClientOptions() });
    clients.add(socket);
    socket.on("error", () => undefined);
    expect(await waitForClose(socket)).toBe(true);
  });

  it("refuses plaintext when only TLS is allowed", async () => {
    const a = await addSource(orgA);
    const h = await start({ allowPlaintext: false, tlsCertFile: certFile, tlsKeyFile: keyFile });
    const socket = await connect(h.port, false);
    socket.on("error", () => undefined);
    socket.write(`${ZSCALER_LINE} vw_source=${a.key}\n`);
    expect(await waitForClose(socket)).toBe(true);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(0);
  });

  it("writes nothing for lines without a key and closes after 100 of them", async () => {
    await addSource(orgA);
    const h = await start();
    const socket = await connect(h.port, false);
    socket.on("error", () => undefined);
    socket.write(`${ZSCALER_LINE}\n`.repeat(150));

    expect(await waitForClose(socket)).toBe(true);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(0);
  });

  it("keeps a connection open past 100 lines once it has sent a valid key", async () => {
    const a = await addSource(orgA);
    const h = await start();
    const socket = await connect(h.port, false);
    socket.on("error", () => undefined);
    socket.write(`${ZSCALER_LINE} vw_source=${a.key}\n${`${ZSCALER_LINE}\n`.repeat(150)}`);

    expect(await waitForClose(socket, 500)).toBe(false);
    socket.end();
    await waitForClose(socket);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(1);
  });

  it("writes nothing for an unknown key", async () => {
    await addSource(orgA);
    const h = await start();
    const unknown = `vwsl_${orgA}_${"ab".repeat(24)}`;
    await send(h.port, [`${ZSCALER_LINE} vw_source=${unknown}\n`]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(0);
  });

  it("never routes a key whose embedded organization differs from its row", async () => {
    const a = await addSource(orgA);
    // Same secret part, org B's id: hashes differently, so it never matches A's row.
    const forged = a.key.replace(`vwsl_${orgA}_`, `vwsl_${orgB}_`);
    await sequelize.query(`UPDATE shadow_ai_syslog_config SET key_hash = :hash WHERE id = :id`, {
      replacements: { hash: hashSourceKey(forged), id: a.id },
    });
    invalidateSourceCache();
    const h = await start();

    await send(h.port, [`${ZSCALER_LINE} vw_source=${forged}\n`]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(0);
    expect(await eventCount(orgB)).toBe(0);
  });

  it("stops accepting the old key after it is regenerated", async () => {
    const a = await addSource(orgA);
    const h = await start();
    await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(1);

    const regenerated = await regenerateSyslogKeyQuery(orgA, a.id);
    invalidateSourceCache();

    await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(1);

    await send(h.port, [`${ZSCALER_LINE} vw_source=${regenerated!.key}\n`]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(2);
  });

  it("counts wrong_sender_ip when the peer is not the allowed sender", async () => {
    const a = await addSource(orgA, "zscaler", "10.9.9.9");
    const h = await start();
    await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`]);
    await h.flushAll();

    expect(await eventCount(orgA)).toBe(0);
    const row = await sourceRow(a.id);
    expect(row.dropped).toBe(1);
    expect(row.lastDropReason).toBe("wrong_sender_ip");
  });

  it("accepts the allowed sender IP", async () => {
    const a = await addSource(orgA, "zscaler", "127.0.0.1");
    const h = await start();
    await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(1);
  });

  it("counts a Squid line with a dash user as no_user", async () => {
    const a = await addSource(orgA, "squid");
    const h = await start();
    await send(h.port, [`${SQUID_DASH_USER} vw_source=${a.key}\n`]);
    await h.flushAll();

    expect(await eventCount(orgA)).toBe(0);
    const row = await sourceRow(a.id);
    expect(row.accepted).toBe(0);
    expect(row.dropped).toBe(1);
    expect(row.lastDropReason).toBe("no_user");
  });

  it("accepts a line split across two writes inside vw_source=", async () => {
    const a = await addSource(orgA);
    const h = await start();
    const line = `${ZSCALER_LINE} vw_source=${a.key}\n`;
    const cut = line.indexOf("vw_source=") + 6;
    await send(h.port, [line.slice(0, cut), line.slice(cut)]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(1);
  });

  it("stores a line whose model capture is too long, without the model", async () => {
    const a = await addSource(orgA);
    const h = await start();
    const host = "acme.openai.azure.com";
    const line = (model: string) =>
      `user=alice@company.com dst=${host} uri=https://${host}/openai/deployments/${model}/chat vw_source=${a.key}\n`;
    await send(h.port, [line("m".repeat(300)) + line("gpt-4o")]);
    await h.flushAll();

    const [rows] = await sequelize.query(
      `SELECT detected_model FROM shadow_ai_events WHERE organization_id = :org ORDER BY id`,
      { replacements: { org: orgA } },
    );
    expect((rows as { detected_model: string | null }[]).map((r) => r.detected_model)).toEqual([
      null,
      "gpt-4o",
    ]);
    expect((await sourceRow(a.id)).accepted).toBe(2);
  });

  it("never routes by another organization's valid key placed inside a field", async () => {
    const a = await addSource(orgA);
    const n = await addSource(orgB, "netskope");
    const orgC = await createTestOrganization("Syslog listener C");
    const c = await addSource(orgC);
    const cNetskope = await addSource(orgC, "netskope");
    const h = await start();

    const decoys = [
      // Real key of A at the end, C's key in a quoted user agent.
      `user=alice@company.com ua="Mozilla vw_source=${c.key}" dst=chat.openai.com vw_source=${a.key}`,
      // Real key of A at the start, C's key in a URL query.
      `vw_source=${a.key} user=alice@company.com uri=https://chat.openai.com/?vw_source=${c.key} dst=chat.openai.com`,
      // No real key: C's key joined to a URL by a pipe, or in the middle.
      `user=alice@company.com uri=https://chat.openai.com/a|vw_source=${c.key} dst=chat.openai.com`,
      `user=alice@company.com vw_source=${c.key} dst=chat.openai.com`,
      // JSON: C's key in a string value, B's key as the top-level member.
      `{"user":"alice@company.com","useragent":"x vw_source=${cNetskope.key}","url":"https://chat.openai.com/","vw_source":"${n.key}"}`,
    ];
    await send(h.port, [decoys.map((l) => `${l}\n`).join("")]);
    await h.flushAll();

    expect(await eventCount(orgA)).toBe(2);
    expect(await eventCount(orgB)).toBe(1);
    expect(await eventCount(orgC)).toBe(0);
    expect((await sourceRow(c.id)).dropped).toBe(0);
    expect((await sourceRow(cNetskope.id)).dropped).toBe(0);
  });

  it("flushes on its own after two seconds", async () => {
    const a = await addSource(orgA);
    const h = await start();
    await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`]);
    await pause(2600);
    expect(await eventCount(orgA)).toBe(1);
    await h.flushAll();
  });

  describe("a key revoked while its events wait to be flushed", () => {
    const writeAndWait = async (socket: net.Socket, line: string) => {
      await new Promise<void>((resolve) => socket.write(line, () => resolve()));
      // Long enough to be routed, well short of the 2 s flush.
      await pause(300);
    };

    it.each([
      ["regenerated", (org: number, id: number) => regenerateSyslogKeyQuery(org, id)],
      [
        "deactivated",
        (org: number, id: number) => updateSyslogConfigQuery(org, id, { is_active: false }),
      ],
      ["deleted", (org: number, id: number) => deleteSyslogConfigQuery(org, id)],
    ])("writes nothing when the source is %s", async (label, revoke) => {
      const a = await addSource(orgA);
      const h = await start();
      const socket = await connect(h.port, false);
      socket.on("error", () => undefined);

      await writeAndWait(socket, `${ZSCALER_LINE} vw_source=${a.key}\n`);
      expect(await eventCount(orgA)).toBe(0);

      await revoke(orgA, a.id);
      invalidateSourceCache();
      await h.flushAll();
      expect(await eventCount(orgA)).toBe(0);
      if (label !== "deleted") expect((await sourceRow(a.id)).accepted).toBe(0);

      // A later line with the old key on the same open connection.
      await writeAndWait(socket, `${ZSCALER_LINE} vw_source=${a.key}\n`);
      await h.flushAll();
      expect(await eventCount(orgA)).toBe(0);
      if (label !== "deleted") expect((await sourceRow(a.id)).accepted).toBe(0);
    });
  });

  it("writes nothing for a previously valid key when the cache reload fails", async () => {
    const a = await addSource(orgA);
    const h = await start();
    await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`]);
    await h.flushAll();
    expect(await eventCount(orgA)).toBe(1);

    const spy = jest
      .spyOn(configUtils, "listActiveSyslogSourcesQuery")
      .mockRejectedValue(new Error("database unavailable"));
    try {
      invalidateSourceCache();
      await send(h.port, [`${ZSCALER_LINE} vw_source=${a.key}\n`]);
      await h.flushAll();
      expect(await eventCount(orgA)).toBe(1);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  describe("IP-only mode", () => {
    it("routes a keyless line to the one source that lists the peer IP", async () => {
      const a = await addSource(orgA, "zscaler", "127.0.0.1");
      const h = await start({ allowIpOnly: true });
      await send(h.port, [`${ZSCALER_LINE}\n`]);
      await h.flushAll();

      expect(await eventCount(orgA)).toBe(1);
      expect((await sourceRow(a.id)).accepted).toBe(1);
    });

    it("drops a keyless line when two sources list the peer IP", async () => {
      const a = await addSource(orgA, "zscaler", "127.0.0.1");
      const b = await addSource(orgB, "zscaler", "127.0.0.1");
      const h = await start({ allowIpOnly: true });
      await send(h.port, [`${ZSCALER_LINE}\n`]);
      await h.flushAll();

      expect(await eventCount(orgA)).toBe(0);
      expect(await eventCount(orgB)).toBe(0);
      expect((await sourceRow(a.id)).lastDropReason).not.toBeNull();
      expect((await sourceRow(b.id)).lastDropReason).not.toBeNull();
    });

    it("leaves keyless lines unrouted when IP-only mode is off", async () => {
      await addSource(orgA, "zscaler", "127.0.0.1");
      const h = await start();
      await send(h.port, [`${ZSCALER_LINE}\n`]);
      await h.flushAll();
      expect(await eventCount(orgA)).toBe(0);
    });
  });
});
