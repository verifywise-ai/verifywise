import { readSyslogListenerConfig, assertStartableConfig, SyslogListenerConfig } from "../config";

describe("assertStartableConfig", () => {
  const base: SyslogListenerConfig = {
    enabled: true,
    port: 6514,
    allowPlaintext: false,
    allowIpOnly: false,
    multiTenancy: false,
  };

  it("refuses when neither TLS files nor plaintext are configured", () => {
    expect(() => assertStartableConfig(base)).toThrow(/TLS.*PLAINTEXT/s);
  });

  it("refuses when only one of the TLS files is set", () => {
    expect(() => assertStartableConfig({ ...base, tlsCertFile: "/c.pem" })).toThrow(
      /SHADOW_AI_SYSLOG_TLS_KEY_FILE/,
    );
    expect(() =>
      assertStartableConfig({ ...base, allowPlaintext: true, tlsKeyFile: "/k.pem" }),
    ).toThrow(/SHADOW_AI_SYSLOG_TLS_CERT_FILE/);
  });

  it("refuses IP-only mode when multi-tenancy is on", () => {
    expect(() =>
      assertStartableConfig({
        ...base,
        allowPlaintext: true,
        allowIpOnly: true,
        multiTenancy: true,
      }),
    ).toThrow(/SHADOW_AI_SYSLOG_ALLOW_IP_ONLY.*MULTI_TENANCY_ENABLED/s);
  });

  it("accepts plaintext only, TLS only, and IP-only on a single-tenant server", () => {
    expect(() => assertStartableConfig({ ...base, allowPlaintext: true })).not.toThrow();
    expect(() =>
      assertStartableConfig({ ...base, tlsCertFile: "/c.pem", tlsKeyFile: "/k.pem" }),
    ).not.toThrow();
    expect(() =>
      assertStartableConfig({ ...base, allowPlaintext: true, allowIpOnly: true }),
    ).not.toThrow();
  });
});

describe("readSyslogListenerConfig", () => {
  it("defaults to disabled on port 6514", () => {
    expect(readSyslogListenerConfig({})).toEqual({
      enabled: false,
      port: 6514,
      tlsCertFile: undefined,
      tlsKeyFile: undefined,
      allowPlaintext: false,
      allowIpOnly: false,
      multiTenancy: false,
    });
  });

  it("turns booleans on only for the exact string true", () => {
    const on = readSyslogListenerConfig({
      SHADOW_AI_SYSLOG_ENABLED: "true",
      SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT: "true",
      SHADOW_AI_SYSLOG_ALLOW_IP_ONLY: "true",
      MULTI_TENANCY_ENABLED: "true",
    });
    expect(on).toMatchObject({
      enabled: true,
      allowPlaintext: true,
      allowIpOnly: true,
      multiTenancy: true,
    });

    for (const value of ["TRUE", "1", "yes", " true", "false", ""]) {
      const off = readSyslogListenerConfig({
        SHADOW_AI_SYSLOG_ENABLED: value,
        SHADOW_AI_SYSLOG_ALLOW_PLAINTEXT: value,
        SHADOW_AI_SYSLOG_ALLOW_IP_ONLY: value,
        MULTI_TENANCY_ENABLED: value,
      });
      expect(off).toMatchObject({
        enabled: false,
        allowPlaintext: false,
        allowIpOnly: false,
        multiTenancy: false,
      });
    }
  });

  it("reads the port and falls back to 6514 for an invalid one", () => {
    expect(readSyslogListenerConfig({ SHADOW_AI_SYSLOG_PORT: "7000" }).port).toBe(7000);
    for (const bad of ["abc", "0", "70000", "-1", "65.5", ""]) {
      expect(readSyslogListenerConfig({ SHADOW_AI_SYSLOG_PORT: bad }).port).toBe(6514);
    }
  });

  it("passes the TLS file paths through", () => {
    const cfg = readSyslogListenerConfig({
      SHADOW_AI_SYSLOG_TLS_CERT_FILE: "/c.pem",
      SHADOW_AI_SYSLOG_TLS_KEY_FILE: "/k.pem",
    });
    expect(cfg.tlsCertFile).toBe("/c.pem");
    expect(cfg.tlsKeyFile).toBe("/k.pem");
  });
});
