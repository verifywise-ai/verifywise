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
const mockEnablement = {
  findByExtensionId: jest.fn(),
  findAllForOrg: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
  updateConfiguration: jest.fn(),
  toJSON: (row: any) => row,
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
