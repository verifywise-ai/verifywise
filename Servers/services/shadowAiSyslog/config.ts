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
