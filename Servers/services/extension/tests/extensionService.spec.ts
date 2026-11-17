import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Encryption is exercised through the service; stub to a deterministic
// prefix so we can assert secret-round-trip and merge behavior without
// depending on the real AES key material.
jest.mock("../../../utils/encryption.utils", () => ({
  encrypt: (v: string) => `enc(${v})`,
  decrypt: (v: string) => (v.startsWith("enc(") && v.endsWith(")") ? v.slice(4, -1) : v),
}));

const mockExtension = {
  findByKey: jest.fn(),
  findAll: jest.fn(),
  toJSON: (row: any) => row,
};
const mockConfigField = {
  findByExtensionId: jest.fn(),
  toJSON: (row: any) => row,
};
// toJSON is the real one: it is where the stored configuration is left out.
jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
const realEnablementModel: any = jest.requireActual(
  "../../../domain.layer/models/extension/extensionEnablement.model",
);
const mockEnablement = {
  findByExtensionId: jest.fn(),
  findAllForOrg: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
  updateConfiguration: jest.fn(),
  toJSON: (row: any) => realEnablementModel.ExtensionEnablementModel.toJSON(row),
};

jest.mock("../../../domain.layer/models/extension/extension.model", () => ({
  ExtensionModel: mockExtension,
}));
jest.mock("../../../domain.layer/models/extension/extensionConfigField.model", () => ({
  ExtensionConfigFieldModel: mockConfigField,
}));
jest.mock("../../../domain.layer/models/extension/extensionEnablement.model", () => ({
  ExtensionEnablementModel: mockEnablement,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ExtensionService } = require("../extensionService");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  NotFoundException,
  ValidationException,
} = require("../../../domain.layer/exceptions/custom.exception");

const EXT = { id: 42, key: "mlflow" };

// Field-set exercising every branch of the validator.
const FIELDS = [
  { field_key: "tracking_server_url", field_type: "url", is_required: true, is_secret: false },
  {
    field_key: "auth_method",
    field_type: "select",
    is_required: true,
    is_secret: false,
    options: [{ value: "none" }, { value: "basic" }, { value: "token" }],
  },
  { field_key: "api_token", field_type: "password", is_required: false, is_secret: true },
  { field_key: "verify_ssl", field_type: "boolean", is_required: false, is_secret: false },
  {
    field_key: "timeout",
    field_type: "number",
    is_required: false,
    is_secret: false,
    validation: { min: 1, max: 600 },
  },
  { field_key: "notify_email", field_type: "email", is_required: false, is_secret: false },
];

function resetMocks() {
  Object.values(mockExtension).forEach((v: any) => v?.mockReset?.());
  Object.values(mockConfigField).forEach((v: any) => v?.mockReset?.());
  Object.values(mockEnablement).forEach((v: any) => v?.mockReset?.());
}

describe("ExtensionService.enable / updateConfiguration validation", () => {
  beforeEach(() => {
    resetMocks();
    mockExtension.findByKey.mockResolvedValue(EXT as never);
    mockConfigField.findByExtensionId.mockResolvedValue(FIELDS as never);
    mockEnablement.findByExtensionId.mockResolvedValue(null as never);
    mockEnablement.enable.mockImplementation(async (...args: any[]) => ({
      enabled: true,
      configuration: args[3],
    }));
  });

  it("throws ValidationException when a required non-secret field is missing", async () => {
    await expect(
      ExtensionService.enable("mlflow", 1, 1, { auth_method: "none" }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("accepts a valid config and encrypts secrets before persisting", async () => {
    await ExtensionService.enable("mlflow", 1, 99, {
      tracking_server_url: "https://mlflow.example.com",
      auth_method: "token",
      api_token: "super-secret",
      verify_ssl: true,
      timeout: 30,
    });
    const stored = mockEnablement.enable.mock.calls[0][3] as Record<string, unknown>;
    expect(stored.api_token).toBe("enc(super-secret)"); // encrypted going in
    expect(stored.tracking_server_url).toBe("https://mlflow.example.com");
    expect(stored.verify_ssl).toBe(true);
  });

  it("silently drops unknown field keys before persisting (safer than failing)", async () => {
    // mergeAndEncrypt walks the config-field schema and skips any input key
    // that isn't declared. This locks the wire contract without breaking
    // clients that send extras.
    const result = await ExtensionService.enable("mlflow", 1, 1, {
      tracking_server_url: "https://mlflow.example.com",
      auth_method: "none",
      junk_field: "surprise",
    });
    const stored = mockEnablement.enable.mock.calls[0][3] as Record<string, unknown>;
    expect("junk_field" in stored).toBe(false);
    expect(stored.tracking_server_url).toBe("https://mlflow.example.com");
    expect((result as any).enabled).toBe(true);
  });

  it("rejects an out-of-range number", async () => {
    await expect(
      ExtensionService.enable("mlflow", 1, 1, {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "none",
        timeout: 9999,
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("rejects an invalid URL", async () => {
    await expect(
      ExtensionService.enable("mlflow", 1, 1, {
        tracking_server_url: "not-a-url",
        auth_method: "none",
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("rejects an invalid email and accepts a valid one", async () => {
    // Sanity check: a well-formed email passes.
    await expect(
      ExtensionService.enable("mlflow", 1, 1, {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "none",
        notify_email: "person@example.com",
      }),
    ).resolves.toBeDefined();
    await expect(
      ExtensionService.enable("mlflow", 1, 1, {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "none",
        notify_email: "definitely-not-an-email",
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("rejects a select value that isn't in the declared options", async () => {
    await expect(
      ExtensionService.enable("mlflow", 1, 1, {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "gopher",
      }),
    ).rejects.toBeInstanceOf(ValidationException);
  });

  it("preserves the previously-stored secret when caller omits it on update", async () => {
    mockEnablement.findByExtensionId.mockResolvedValue({
      enabled: true,
      configuration: {
        api_token: "enc(existing-token)",
        auth_method: "token",
        tracking_server_url: "https://mlflow.example.com",
      },
    } as never);
    mockEnablement.updateConfiguration.mockImplementation(async (...args: any[]) => ({
      enabled: true,
      configuration: args[2],
    }));

    await ExtensionService.updateConfiguration("mlflow", 1, {
      // caller only re-submits non-secret fields
      tracking_server_url: "https://mlflow.example.com",
      auth_method: "token",
    });

    const merged = mockEnablement.updateConfiguration.mock.calls[0][2] as Record<string, unknown>;
    expect(merged.api_token).toBe("enc(existing-token)");
  });

  it("throws NotFoundException when the extension key isn't in the catalog", async () => {
    mockExtension.findByKey.mockResolvedValueOnce(null as never);
    await expect(ExtensionService.enable("does-not-exist", 1, 1, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("ExtensionService.getByKey / listAll (secret redaction)", () => {
  beforeEach(() => {
    resetMocks();
    mockExtension.findByKey.mockResolvedValue(EXT as never);
    mockConfigField.findByExtensionId.mockResolvedValue(FIELDS as never);
  });

  it("strips is_secret field values from the outward-facing config", async () => {
    mockEnablement.findByExtensionId.mockResolvedValue({
      enabled: true,
      configuration: {
        tracking_server_url: "https://mlflow.example.com",
        api_token: "enc(super-secret)",
      },
    } as never);

    const result = await ExtensionService.getByKey("mlflow", 1);
    const cfg = (result as any).configuration as Record<string, unknown>;
    expect(cfg.tracking_server_url).toBe("https://mlflow.example.com");
    // Secrets never leave the backend, even in encrypted form.
    expect("api_token" in cfg).toBe(false);
  });
});

describe("ExtensionService.getRuntimeConfiguration (server-side decryption)", () => {
  beforeEach(() => {
    resetMocks();
    mockExtension.findByKey.mockResolvedValue(EXT as never);
    mockConfigField.findByExtensionId.mockResolvedValue(FIELDS as never);
  });

  it("decrypts secret fields for internal callers", async () => {
    mockEnablement.findByExtensionId.mockResolvedValue({
      enabled: true,
      configuration: {
        tracking_server_url: "https://mlflow.example.com",
        api_token: "enc(super-secret)",
      },
    } as never);

    const cfg = await ExtensionService.getRuntimeConfiguration("mlflow", 1);
    expect(cfg.api_token).toBe("super-secret"); // decrypted
    expect(cfg.tracking_server_url).toBe("https://mlflow.example.com");
  });

  it("returns empty object when the extension is not enabled for the org", async () => {
    mockEnablement.findByExtensionId.mockResolvedValue(null as never);
    const cfg = await ExtensionService.getRuntimeConfiguration("mlflow", 1);
    expect(cfg).toEqual({});
  });
});

describe("ExtensionService responses never carry stored configuration", () => {
  // The stored row holds the secret as ciphertext; neither it nor the
  // plaintext may appear anywhere in a response, for any endpoint.
  const STORED_ROW = {
    id: 7,
    organization_id: 1,
    extension_id: EXT.id,
    enabled: true,
    configuration: {
      tracking_server_url: "https://mlflow.example.com",
      auth_method: "token",
      api_token: "enc(super-secret)",
    },
  };

  function expectNoStoredConfiguration(result: Record<string, unknown>) {
    const enablement = result.enablement as Record<string, unknown> | null;
    expect(enablement).not.toBeNull();
    expect("configuration" in (enablement as Record<string, unknown>)).toBe(false);
    expect(enablement?.id).toBe(7);
    // Redacted top-level copy keeps the non-secret values.
    expect((result.configuration as Record<string, unknown>).tracking_server_url).toBe(
      "https://mlflow.example.com",
    );
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("super-secret");
    expect(payload).not.toContain("enc(");
  }

  beforeEach(() => {
    resetMocks();
    mockExtension.findByKey.mockResolvedValue(EXT as never);
    mockExtension.findAll.mockResolvedValue([EXT] as never);
    mockConfigField.findByExtensionId.mockResolvedValue(FIELDS as never);
    mockEnablement.findByExtensionId.mockResolvedValue(STORED_ROW as never);
    mockEnablement.findAllForOrg.mockResolvedValue([STORED_ROW] as never);
    mockEnablement.enable.mockResolvedValue(STORED_ROW as never);
    mockEnablement.disable.mockResolvedValue({ ...STORED_ROW, enabled: false } as never);
    mockEnablement.updateConfiguration.mockResolvedValue(STORED_ROW as never);
  });

  it("listAll", async () => {
    const [result] = await ExtensionService.listAll(1);
    expectNoStoredConfiguration(result);
  });

  it("getByKey", async () => {
    expectNoStoredConfiguration(await ExtensionService.getByKey("mlflow", 1));
  });

  it("enable", async () => {
    expectNoStoredConfiguration(
      await ExtensionService.enable("mlflow", 1, 1, {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "token",
      }),
    );
  });

  it("disable", async () => {
    expectNoStoredConfiguration(await ExtensionService.disable("mlflow", 1));
  });

  it("updateConfiguration", async () => {
    expectNoStoredConfiguration(
      await ExtensionService.updateConfiguration("mlflow", 1, {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "token",
        api_token: "super-secret",
      }),
    );
  });

  it("returns a null enablement when the extension is not enabled", async () => {
    mockEnablement.findByExtensionId.mockResolvedValue(null as never);
    const result = await ExtensionService.getByKey("mlflow", 1);
    expect(result.enablement).toBeNull();
    expect(result.configuration).toEqual({});
  });
});

describe("ExtensionService never keeps a stored secret for a changed address", () => {
  const MLFLOW_FIELDS = [
    { field_key: "tracking_server_url", field_type: "url", is_required: true, is_secret: false },
    {
      field_key: "auth_method",
      field_type: "select",
      is_required: true,
      is_secret: false,
      options: [{ value: "none" }, { value: "basic" }, { value: "token" }],
    },
    { field_key: "username", field_type: "text", is_required: false, is_secret: false },
    { field_key: "password", field_type: "password", is_required: false, is_secret: true },
    { field_key: "api_token", field_type: "password", is_required: false, is_secret: true },
  ];
  const AZURE_FIELDS = [
    { field_key: "project_endpoint", field_type: "url", is_required: true, is_secret: false },
    { field_key: "api_key", field_type: "password", is_required: true, is_secret: true },
  ];
  const TOKEN_ROW = {
    enabled: true,
    configuration: {
      tracking_server_url: "https://mlflow.example.com",
      auth_method: "token",
      api_token: "enc(stored-token)",
    },
  };

  function setUp(key: string, fields: unknown[], row: unknown) {
    resetMocks();
    mockExtension.findByKey.mockResolvedValue({ id: 42, key } as never);
    mockConfigField.findByExtensionId.mockResolvedValue(fields as never);
    mockEnablement.findByExtensionId.mockResolvedValue(row as never);
    mockEnablement.updateConfiguration.mockImplementation(async (...args: any[]) => ({
      enabled: true,
      configuration: args[2],
    }));
    mockEnablement.enable.mockImplementation(async (...args: any[]) => ({
      enabled: true,
      configuration: args[3],
    }));
  }
  const saved = () => mockEnablement.updateConfiguration.mock.calls[0][2] as Record<string, any>;

  it("refuses a changed URL without a token and saves nothing", async () => {
    setUp("mlflow", MLFLOW_FIELDS, TOKEN_ROW);
    const save = ExtensionService.updateConfiguration("mlflow", 1, {
      tracking_server_url: "https://evil.example.com",
      auth_method: "token",
    });
    await expect(save).rejects.toBeInstanceOf(ValidationException);
    await expect(save).rejects.toThrow(
      "Enter the API token again: the tracking server URL changed.",
    );
    expect(mockEnablement.updateConfiguration).not.toHaveBeenCalled();
  });

  it("refuses the same on re-enable", async () => {
    setUp("mlflow", MLFLOW_FIELDS, TOKEN_ROW);
    await expect(
      ExtensionService.enable("mlflow", 1, 1, {
        tracking_server_url: "https://evil.example.com",
        auth_method: "token",
      }),
    ).rejects.toThrow("Enter the API token again: the tracking server URL changed.");
    expect(mockEnablement.enable).not.toHaveBeenCalled();
  });

  it("saves a changed URL with a new token", async () => {
    setUp("mlflow", MLFLOW_FIELDS, TOKEN_ROW);
    await ExtensionService.updateConfiguration("mlflow", 1, {
      tracking_server_url: "https://new.example.com",
      auth_method: "token",
      api_token: "new-token",
    });
    expect(saved().api_token).toBe("enc(new-token)");
  });

  it("keeps the stored token when the URL is unchanged (trailing slash)", async () => {
    setUp("mlflow", MLFLOW_FIELDS, TOKEN_ROW);
    await ExtensionService.updateConfiguration("mlflow", 1, {
      tracking_server_url: "https://mlflow.example.com/",
      auth_method: "token",
    });
    expect(saved().api_token).toBe("enc(stored-token)");
  });

  it("refuses a changed username under basic auth without a password", async () => {
    setUp("mlflow", MLFLOW_FIELDS, {
      enabled: true,
      configuration: {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "basic",
        username: "alice",
        password: "enc(stored-password)",
      },
    });
    await expect(
      ExtensionService.updateConfiguration("mlflow", 1, {
        tracking_server_url: "https://mlflow.example.com",
        auth_method: "basic",
        username: "mallory",
      }),
    ).rejects.toThrow("Enter the password again: the username changed.");
  });

  it("drops a stored token the new configuration would not send", async () => {
    setUp("mlflow", MLFLOW_FIELDS, TOKEN_ROW);
    await ExtensionService.updateConfiguration("mlflow", 1, {
      tracking_server_url: "https://new.example.com",
      auth_method: "none",
    });
    expect(saved()).not.toHaveProperty("api_token");
  });

  it("re-enables Jira Assets over an old enablement row that still holds a token", async () => {
    // Jira Assets has no config fields (its connection lives in
    // jira_assets_config); rows from August 2026 can still hold these keys.
    setUp("jira-assets", [], {
      enabled: false,
      configuration: {
        jira_base_url: "https://old-jira.example.com",
        api_token: "enc(legacy-token)",
      },
    });
    const result = await ExtensionService.enable("jira-assets", 1, 1, {});
    expect(result.enabled).toBe(true);
    const stored = mockEnablement.enable.mock.calls[0][3] as Record<string, unknown>;
    expect(stored).toEqual({});
  });

  it("refuses a changed Azure endpoint without a key", async () => {
    setUp("azure-ai-foundry", AZURE_FIELDS, {
      enabled: true,
      configuration: { project_endpoint: "https://a.example.com/p", api_key: "enc(k)" },
    });
    await expect(
      ExtensionService.updateConfiguration("azure-ai-foundry", 1, {
        project_endpoint: "https://evil.example.com/p",
      }),
    ).rejects.toThrow("Enter the API key again: the project endpoint changed.");
  });
});

describe("ExtensionService merges a partial configuration onto the stored one", () => {
  const MLFLOW_FIELDS = [
    { field_key: "tracking_server_url", field_type: "url", is_required: true, is_secret: false },
    {
      field_key: "auth_method",
      field_type: "select",
      is_required: true,
      is_secret: false,
      options: [{ value: "none" }, { value: "basic" }, { value: "token" }],
    },
    { field_key: "username", field_type: "text", is_required: false, is_secret: false },
    { field_key: "timeout", field_type: "number", is_required: false, is_secret: false },
    { field_key: "api_token", field_type: "password", is_required: false, is_secret: true },
  ];
  const AZURE_FIELDS = [
    { field_key: "project_endpoint", field_type: "url", is_required: true, is_secret: false },
    { field_key: "api_key", field_type: "password", is_required: true, is_secret: true },
  ];
  const STORED = {
    tracking_server_url: "https://mlflow.example.com",
    auth_method: "token",
    username: "alice",
    timeout: 30,
    api_token: "enc(stored-token)",
  };

  function setUp(fields: unknown[], configuration: Record<string, unknown>, key = "mlflow") {
    resetMocks();
    mockExtension.findByKey.mockResolvedValue({ id: 42, key } as never);
    mockConfigField.findByExtensionId.mockResolvedValue(fields as never);
    mockEnablement.findByExtensionId.mockResolvedValue({
      enabled: false,
      configuration,
    } as never);
    mockEnablement.updateConfiguration.mockImplementation(async (...args: any[]) => ({
      enabled: true,
      configuration: args[2],
    }));
    mockEnablement.enable.mockImplementation(async (...args: any[]) => ({
      enabled: true,
      configuration: args[3],
    }));
  }
  const updated = () =>
    mockEnablement.updateConfiguration.mock.calls[0][2] as Record<string, unknown>;

  it("re-enables with an empty payload and keeps every stored value", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await ExtensionService.enable("mlflow", 1, 1, {});
    const stored = mockEnablement.enable.mock.calls[0][3] as Record<string, unknown>;
    expect(stored).toEqual(STORED);
  });

  it("updates one field and keeps the others", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await ExtensionService.updateConfiguration("mlflow", 1, { timeout: 60 });
    expect(updated()).toEqual({ ...STORED, timeout: 60 });
  });

  it("clears an optional non-secret field sent as null or an empty string", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await ExtensionService.updateConfiguration("mlflow", 1, { username: null, timeout: "" });
    expect(updated()).not.toHaveProperty("username");
    expect(updated()).not.toHaveProperty("timeout");
    expect(updated().tracking_server_url).toBe("https://mlflow.example.com");
  });

  it("clears a stored secret sent as null", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await ExtensionService.updateConfiguration("mlflow", 1, { api_token: null });
    expect(updated()).not.toHaveProperty("api_token");
    expect(updated().tracking_server_url).toBe("https://mlflow.example.com");
  });

  it("keeps a stored secret sent as an empty string", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await ExtensionService.updateConfiguration("mlflow", 1, { api_token: "" });
    expect(updated().api_token).toBe("enc(stored-token)");
  });

  it("refuses to clear a required secret", async () => {
    setUp(
      AZURE_FIELDS,
      { project_endpoint: "https://a.example.com/p", api_key: "enc(k)" },
      "azure-ai-foundry",
    );
    const save = ExtensionService.updateConfiguration("azure-ai-foundry", 1, { api_key: null });
    await expect(save).rejects.toBeInstanceOf(ValidationException);
    await expect(save).rejects.toThrow("Field 'api_key' is required");
    expect(mockEnablement.updateConfiguration).not.toHaveBeenCalled();
  });

  it("refuses to clear a required non-secret field", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await expect(
      ExtensionService.updateConfiguration("mlflow", 1, { auth_method: null }),
    ).rejects.toThrow("Field 'auth_method' is required");
  });

  it("does not refuse a changed URL when the stored token is cleared with it", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await ExtensionService.updateConfiguration("mlflow", 1, {
      tracking_server_url: "https://new.example.com",
      api_token: null,
    });
    expect(updated()).not.toHaveProperty("api_token");
    expect(updated().tracking_server_url).toBe("https://new.example.com");
  });

  it("still refuses a changed URL in a partial payload without a token", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await expect(
      ExtensionService.updateConfiguration("mlflow", 1, {
        tracking_server_url: "https://evil.example.com",
      }),
    ).rejects.toThrow("Enter the API token again: the tracking server URL changed.");
  });

  it("drops the stored token when only the auth method changes away from token", async () => {
    setUp(MLFLOW_FIELDS, STORED);
    await ExtensionService.updateConfiguration("mlflow", 1, {
      tracking_server_url: "https://new.example.com",
      auth_method: "none",
    });
    expect(updated()).not.toHaveProperty("api_token");
    expect(updated().username).toBe("alice");
  });
});

describe("ExtensionService reports which secrets are stored", () => {
  beforeEach(() => {
    resetMocks();
    mockExtension.findByKey.mockResolvedValue(EXT as never);
    mockConfigField.findByExtensionId.mockResolvedValue([
      ...FIELDS,
      { field_key: "password", field_type: "password", is_required: false, is_secret: true },
    ] as never);
  });

  it("lists the secret fields with a stored value and never the value", async () => {
    mockEnablement.findByExtensionId.mockResolvedValue({
      enabled: true,
      configuration: {
        tracking_server_url: "https://mlflow.example.com",
        api_token: "enc(super-secret)",
        password: "",
      },
    } as never);
    const result = await ExtensionService.getByKey("mlflow", 1);
    expect(result.secretsSet).toEqual(["api_token"]);
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  it("is empty when the extension is not enabled", async () => {
    mockEnablement.findByExtensionId.mockResolvedValue(null as never);
    const result = await ExtensionService.getByKey("mlflow", 1);
    expect(result.secretsSet).toEqual([]);
  });
});

describe("isFilled (shared with the service)", () => {
  it("treats undefined, null and an empty string as not set, anything else as set", async () => {
    const { isFilled } = await import("../storedSecretGuard");
    expect([undefined, null, ""].map(isFilled)).toEqual([false, false, false]);
    expect([0, false, " ", "x", []].map(isFilled)).toEqual([true, true, true, true, true]);
  });
});
