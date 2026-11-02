/**
 * Shadow AI syslog listener configuration, read from the environment.
 *
 * Booleans are on only for the exact string "true". Unset or invalid values
 * keep the safe default.
 */

export interface SyslogListenerConfig {
  enabled: boolean;
  port: number;
  tlsCertFile?: string;
  tlsKeyFile?: string;
  allowPlaintext: boolean;
  allowIpOnly: boolean;
  multiTenancy: boolean;
}

export const DEFAULT_SYSLOG_PORT = 6514;

function flag(value: string | undefined): boolean {
  return value === "true";
}

function readPort(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) return DEFAULT_SYSLOG_PORT;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : DEFAULT_SYSLOG_PORT;
}

export function readSyslogListenerConfig(
  env: NodeJS.ProcessEnv = process.env,
): SyslogListenerConfig {
  return {
    enabled: flag(env.SHADOW_AI_SYSLOG_ENABLED),
    port: readPort(env.SHADOW_AI_SYSLOG_PORT),
    tlsCertFile: env.SHADOW_AI_SYSLOG_TLS_CERT_FILE || undefined,
    tlsKeyFile: env.SHADOW_AI_SYSLOG_TLS_KEY_FILE || undefined,
    allowPlaintext: flag(env.SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT),
    allowIpOnly: flag(env.SHADOW_AI_SYSLOG_ALLOW_IP_ONLY),
    multiTenancy: flag(env.MULTI_TENANCY_ENABLED),
  };
}

/**
 * Throw a descriptive error when the listener cannot start safely. The message
 * names the environment variables to change and never includes file contents.
 */
export function assertStartableConfig(cfg: SyslogListenerConfig): void {
  if (cfg.tlsCertFile && !cfg.tlsKeyFile) {
    throw new Error(
      "Shadow AI syslog listener not started: SHADOW_AI_SYSLOG_TLS_CERT_FILE is set but SHADOW_AI_SYSLOG_TLS_KEY_FILE is not.",
    );
  }
  if (cfg.tlsKeyFile && !cfg.tlsCertFile) {
    throw new Error(
      "Shadow AI syslog listener not started: SHADOW_AI_SYSLOG_TLS_KEY_FILE is set but SHADOW_AI_SYSLOG_TLS_CERT_FILE is not.",
    );
  }
  if (!cfg.tlsCertFile && !cfg.allowPlaintext) {
    throw new Error(
      "Shadow AI syslog listener not started: set SHADOW_AI_SYSLOG_TLS_CERT_FILE and SHADOW_AI_SYSLOG_TLS_KEY_FILE for TLS, or SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT=true.",
    );
  }
  if (cfg.allowIpOnly && cfg.multiTenancy) {
    throw new Error(
      "Shadow AI syslog listener not started: SHADOW_AI_SYSLOG_ALLOW_IP_ONLY cannot be used when MULTI_TENANCY_ENABLED=true.",
    );
  }
}
