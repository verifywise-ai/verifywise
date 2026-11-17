import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// The factory lazy-requires ./s3Storage only for s3 rows; mock it so reads
// never touch the network.
const mockS3Get = jest.fn<any>();
jest.mock("../s3Storage", () => ({
  S3Storage: jest.fn().mockImplementation(() => ({
    provider: "s3",
    get: (...args: any[]) => mockS3Get(...args),
    delete: jest.fn<any>(),
    put: jest.fn<any>(),
    signUrl: jest.fn<any>(),
  })),
  loadS3Config: jest.fn(() => ({ bucket: "b" })),
}));

import {
  buildStorageKey,
  getConfiguredProvider,
  getFileStorage,
  getStorageForProvider,
  resetStorageForTests,
  resolveFileContent,
} from "../index";
import { DatabaseStorage } from "../databaseStorage";
import { StorageConfigError, StorageError, StorageUnsupportedError } from "../types";

const ENV_KEYS = ["STORAGE_PROVIDER", "S3_KEY_PREFIX"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  resetStorageForTests();
  mockS3Get.mockReset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  resetStorageForTests();
});

describe("getConfiguredProvider", () => {
  it("defaults to local when STORAGE_PROVIDER is unset", () => {
    expect(getConfiguredProvider()).toBe("local");
  });

  it("accepts s3 case-insensitively", () => {
    process.env.STORAGE_PROVIDER = "S3";
    expect(getConfiguredProvider()).toBe("s3");
  });

  it("rejects unknown values without echoing them", () => {
    process.env.STORAGE_PROVIDER = "super-secret-typo";
    expect(() => getConfiguredProvider()).toThrow(StorageConfigError);
    try {
      getConfiguredProvider();
    } catch (error) {
      expect((error as Error).message).not.toContain("super-secret-typo");
    }
  });
});

describe("factory", () => {
  it("returns the database adapter for local and caches instances", () => {
    const first = getFileStorage();
    expect(first).toBeInstanceOf(DatabaseStorage);
    expect(getStorageForProvider("local")).toBe(first);
  });

  it("constructs the s3 adapter only on demand", () => {
    const s3 = getStorageForProvider("s3");
    expect(s3.provider).toBe("s3");
    expect(getStorageForProvider("s3")).toBe(s3);
  });
});

describe("buildStorageKey", () => {
  it("builds a tenant-scoped, sanitized, unique key under the default prefix", () => {
    const key = buildStorageKey(7, "my report (final).pdf");
    expect(key).toMatch(/^files\/org-7\/[0-9a-f-]{36}-my_report__final_.pdf$/);
  });

  it("produces distinct keys for the same input", () => {
    expect(buildStorageKey(1, "a.pdf")).not.toBe(buildStorageKey(1, "a.pdf"));
  });

  it("honours S3_KEY_PREFIX and trims its slashes", () => {
    process.env.S3_KEY_PREFIX = "/tenant-data/";
    expect(buildStorageKey(3, "a.txt")).toMatch(/^tenant-data\/org-3\//);
  });
});

describe("resolveFileContent", () => {
  it("returns the content column when the row has no storage key", async () => {
    const content = Buffer.from("db-bytes");
    await expect(resolveFileContent({ content })).resolves.toBe(content);
  });

  it("returns null when the row has no bytes at all", async () => {
    await expect(resolveFileContent({ content: null })).resolves.toBeNull();
  });

  it("fetches from the provider recorded on the row, not the global config", async () => {
    // Global provider is local, but this row's bytes live in s3.
    const bytes = Buffer.from("s3-bytes");
    mockS3Get.mockResolvedValueOnce(bytes);

    const result = await resolveFileContent({
      content: null,
      storage_provider: "s3",
      storage_key: "files/org-1/a.pdf",
    });

    expect(result).toBe(bytes);
    expect(mockS3Get).toHaveBeenCalledWith("files/org-1/a.pdf");
  });

  it("routes a local-provider storage key to the local adapter (which cannot serve bytes)", async () => {
    await expect(
      resolveFileContent({ content: null, storage_provider: "local", storage_key: "k" }),
    ).rejects.toBeInstanceOf(StorageUnsupportedError);
  });

  it("rejects rows referencing an unknown provider", async () => {
    await expect(
      resolveFileContent({ content: null, storage_provider: "gcs", storage_key: "k" }),
    ).rejects.toBeInstanceOf(StorageError);
  });
});
