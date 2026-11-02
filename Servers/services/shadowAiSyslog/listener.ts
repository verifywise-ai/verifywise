/**
 * Shadow AI syslog listener.
 *
 * One TCP port for TLS and plaintext: the first byte of a connection decides
 * (0x16 is a TLS handshake). Each line is routed on its own by the source key
 * it carries (`vw_source=...`), or, in IP-only mode, by the peer IP. Raw lines
 * and keys are never logged; the peer IP is logged at debug only.
 */

import fs from "fs";
import net from "net";
import tls from "tls";
import logger from "../../utils/logger/fileLogger";
import { SourceBatcher } from "./batcher";
import { assertStartableConfig, readSyslogListenerConfig, SyslogListenerConfig } from "./config";
import { SyslogFramer } from "./framing";
import { stripSyslogHeader } from "./header";
import { normalizeIp } from "./ip";
import { parseLine } from "./parsers";
import { CachedSource, resolveByKey, sourcesForIp } from "./sourceCache";
import { extractSourceKey } from "./sourceKey";

export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_CONNECTIONS = 500;
export const IDLE_TIMEOUT_MS = 5 * 60_000;
export const TLS_HANDSHAKE_TIMEOUT_MS = 30_000;
export const MAX_LINES_WITHOUT_KEY = 100;
export const NO_KEY_TIMEOUT_MS = 60_000;

const TLS_HANDSHAKE_BYTE = 0x16;
const HANDLING_ERROR_LOG_INTERVAL_MS = 60_000;
let lastHandlingErrorLog = 0;

/** Once a minute at most; the error message only, never the line or key. */
function logHandlingError(error: unknown): void {
  const now = Date.now();
  if (now - lastHandlingErrorLog < HANDLING_ERROR_LOG_INTERVAL_MS) return;
  lastHandlingErrorLog = now;
  const message = error instanceof Error ? error.message : "unknown error";
  logger.warn(`Shadow AI syslog line handling failed, closing the connection: ${message}`);
}

export interface SyslogListenerHandle {
  port: number;
  /** Wait for received lines to be processed, then write every buffered batch. */
  flushAll(): Promise<void>;
  close(): Promise<void>;
}

// Lines refused for having no valid key or IP-only match (process lifetime).
let refusedLines = 0;

export function getRefusedLineCount(): number {
  return refusedLines;
}

const onOff = (on: boolean) => (on ? "on" : "off");

export interface SyslogListenerState {
  /** True while this process has the listener bound and accepting. */
  started: boolean;
  /** Why the last start attempt failed; never carries secrets or file contents. */
  lastStartError: { code: string; message: string } | null;
}

let state: SyslogListenerState = { started: false, lastStartError: null };

/** Whether the listener is running in this process, for the status endpoint. */
export function getSyslogListenerState(): SyslogListenerState {
  return { ...state, lastStartError: state.lastStartError && { ...state.lastStartError } };
}

export async function startSyslogListener(
  cfg: SyslogListenerConfig = readSyslogListenerConfig(),
): Promise<SyslogListenerHandle | null> {
  if (!cfg.enabled) return null;
  try {
    const handle = await bindSyslogListener(cfg);
    state = { started: true, lastStartError: null };
    return handle;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    state = {
      started: false,
      lastStartError: {
        code: typeof err?.code === "string" ? err.code : "START_FAILED",
        // Config, TLS and bind errors name env variables, errno codes and the
        // port only: the TLS error deliberately omits paths and file contents.
        message: err?.message ?? "unknown error",
      },
    };
    throw error;
  }
}

async function bindSyslogListener(cfg: SyslogListenerConfig): Promise<SyslogListenerHandle> {
  try {
    assertStartableConfig(cfg);
  } catch (error) {
    throw Object.assign(error as Error, { code: "INVALID_CONFIG" });
  }

  let secureContext: tls.SecureContext | null = null;
  if (cfg.tlsCertFile && cfg.tlsKeyFile) {
    try {
      secureContext = tls.createSecureContext({
        cert: fs.readFileSync(cfg.tlsCertFile),
        key: fs.readFileSync(cfg.tlsKeyFile),
        minVersion: "TLSv1.2",
      });
    } catch (error) {
      throw Object.assign(
        new Error(
          `Shadow AI syslog listener not started: could not load the TLS certificate or key (${(error as NodeJS.ErrnoException)?.code ?? "invalid file"}).`,
        ),
        { code: "TLS_LOAD_FAILED" },
      );
    }
  }

  const batcher = new SourceBatcher();
  // One teardown function per open connection, for shutdown.
  const connections = new Set<() => void>();
  const work = new Set<Promise<void>>();

  const server = net.createServer((socket) => {
    handleConnection(socket, {
      cfg,
      secureContext,
      batcher,
      track: (p) => {
        work.add(p);
        void p.finally(() => work.delete(p));
      },
      register: (destroy) => {
        connections.add(destroy);
        return () => connections.delete(destroy);
      },
    });
  });
  server.maxConnections = MAX_CONNECTIONS;
  server.on("error", (error) => {
    logger.error(`Shadow AI syslog listener error: ${error.message}`);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(cfg.port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const port = (server.address() as net.AddressInfo).port;
  logger.info(
    `Shadow AI syslog listener started on port ${port} (tls: ${onOff(!!secureContext)}, plaintext: ${onOff(cfg.allowPlaintext)}, ip-only: ${onOff(cfg.allowIpOnly)})`,
  );

  const drainWork = async () => {
    while (work.size > 0) await Promise.allSettled([...work]);
  };

  let closing: Promise<void> | null = null;
  return {
    port,
    async flushAll() {
      await drainWork();
      await batcher.flushAll();
    },
    close() {
      if (!closing) {
        state = { ...state, started: false };
        closing = (async () => {
          const closed = new Promise<void>((resolve) => server.close(() => resolve()));
          for (const destroy of [...connections]) destroy();
          await closed;
          await drainWork();
          await batcher.flushAll();
        })();
      }
      return closing;
    },
  };
}

interface ConnectionContext {
  cfg: SyslogListenerConfig;
  secureContext: tls.SecureContext | null;
  batcher: SourceBatcher;
  track(p: Promise<void>): void;
  /** Register a teardown function; returns its unregister function. */
  register(destroy: () => void): () => void;
}

function handleConnection(raw: net.Socket, ctx: ConnectionContext): void {
  const peerIp = normalizeIp(raw.remoteAddress ?? "") ?? "";
  const framer = new SyslogFramer(MAX_MESSAGE_BYTES);
  let hasValidRoute = false;
  let linesWithoutRoute = 0;
  let chain: Promise<void> = Promise.resolve();

  const timers: NodeJS.Timeout[] = [];
  let secure: tls.TLSSocket | null = null;
  let closed = false;
  // Set when the listener itself ends the connection (refusal, timeout, error).
  // A sender that closes after writing still gets every received line routed.
  let stopped = false;

  const destroyAll = () => {
    secure?.destroy();
    raw.destroy();
  };
  const unregister = ctx.register(destroyAll);
  // Runs once, on whichever socket reports the close first.
  const onClosed = () => {
    if (closed) return;
    closed = true;
    for (const t of timers) clearTimeout(t);
    unregister();
    destroyAll();
  };
  const close = (why: string) => {
    if (stopped) return;
    stopped = true;
    if (closed) return;
    logger.debug(`Shadow AI syslog connection from ${peerIp} closed: ${why}`);
    destroyAll();
  };

  raw.setTimeout(IDLE_TIMEOUT_MS, () => close("idle timeout"));
  raw.on("error", () => close("socket error"));
  raw.once("close", onClosed);

  const noKeyTimer = setTimeout(() => {
    if (!hasValidRoute) close("no valid source key within 60 s");
  }, NO_KEY_TIMEOUT_MS);
  timers.push(noKeyTimer);

  const refuse = () => {
    refusedLines++;
    linesWithoutRoute++;
    if (!hasValidRoute && linesWithoutRoute >= MAX_LINES_WITHOUT_KEY) {
      close(`${MAX_LINES_WITHOUT_KEY} lines without a valid source key`);
    }
  };

  const routeFor = async (key: string | null): Promise<CachedSource | null> => {
    if (key) return resolveByKey(key);
    if (!ctx.cfg.allowIpOnly) return null;
    const matches = await sourcesForIp(peerIp);
    if (matches.length === 1) return matches[0];
    // Several sources list this IP: none of them can claim the line.
    for (const src of matches) ctx.batcher.drop(src, "wrong_sender_ip");
    return null;
  };

  const handleMessage = async (message: string): Promise<void> => {
    const { body, headerTimestamp } = stripSyslogHeader(message);
    const { key, rest } = extractSourceKey(body);
    const src = await routeFor(key);
    if (!src) {
      refuse();
      return;
    }
    hasValidRoute = true;
    clearTimeout(noKeyTimer);

    if (src.allowedIp !== null && normalizeIp(src.allowedIp) !== peerIp) {
      ctx.batcher.drop(src, "wrong_sender_ip");
      return;
    }
    const parsed = parseLine(src.parserType, rest, headerTimestamp);
    if (parsed.ok) ctx.batcher.add(src, parsed.event);
    else ctx.batcher.drop(src, parsed.reason);
  };

  const attachReader = (stream: net.Socket) => {
    stream.on("data", (chunk: Buffer) => {
      const { messages, oversized } = framer.push(chunk);
      for (let i = 0; i < oversized; i++) refuse();
      if (messages.length === 0 || stopped) return;
      // Hold further reads until these lines are routed, so a fast sender
      // cannot queue unbounded work in memory.
      stream.pause();
      chain = chain
        .then(async () => {
          for (const message of messages) {
            if (stopped) return;
            await handleMessage(message);
          }
        })
        .catch((error: unknown) => {
          logHandlingError(error);
          close("line handling failed");
        })
        .finally(() => {
          if (!stopped && !closed) stream.resume();
        });
      ctx.track(chain);
    });
  };

  raw.once("data", (first: Buffer) => {
    raw.pause();
    raw.unshift(first);

    if (first[0] === TLS_HANDSHAKE_BYTE) {
      if (!ctx.secureContext) {
        close("TLS handshake but TLS is not configured");
        return;
      }
      secure = new tls.TLSSocket(raw, {
        isServer: true,
        secureContext: ctx.secureContext,
      });
      const handshakeTimer = setTimeout(
        () => close("TLS handshake timeout"),
        TLS_HANDSHAKE_TIMEOUT_MS,
      );
      timers.push(handshakeTimer);
      secure.once("secure", () => clearTimeout(handshakeTimer));
      secure.on("error", () => close("TLS error"));
      secure.once("close", onClosed);
      attachReader(secure);
      return;
    }

    if (!ctx.cfg.allowPlaintext) {
      close("plaintext but only TLS is allowed");
      return;
    }
    attachReader(raw);
    raw.resume();
  });
}
