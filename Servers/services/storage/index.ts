import { randomUUID } from "crypto";
import { FileStorage } from "./fileStorage";
import { StorageConfigError, StorageError, StorageProvider } from "./types";

/**
 * Environment-driven storage provider selection.
 *
 * STORAGE_PROVIDER=local (default) keeps the historical behavior: file bytes
 * are stored in the files.content column. STORAGE_PROVIDER=s3 stores bytes in
 * an S3-compatible object store and records the object key on the row.
 *
 * Reads are resolved per row (see resolveFileContent) using the provider
 * recorded on the row, not the global configuration, so switching providers
 * never makes existing files inaccessible.
 */

const DEFAULT_S3_KEY_PREFIX = "files/";

const instances: Partial<Record<StorageProvider, FileStorage>> = {};

export const getConfiguredProvider = (): StorageProvider => {
  const raw = (process.env.STORAGE_PROVIDER || "local").trim().toLowerCase();
  if (raw === "local" || raw === "s3") {
    return raw;
  }
  // Never echo the configured value: it may be a mistyped secret.
  throw new StorageConfigError('Invalid STORAGE_PROVIDER value; expected "local" or "s3".');
};

export const getStorageForProvider = (provider: StorageProvider): FileStorage => {
  const cached = instances[provider];
  if (cached) {
    return cached;
  }
  let storage: FileStorage;
  if (provider === "s3") {
    // Lazy require so deployments without S3 configured never load the SDK
    // or validate S3 configuration. The `typeof import()` cast makes
    // TypeScript add the file to the emit program: a plain require() is not
    // followed by tsc, so dist/services/storage/s3Storage.js would never be
    // emitted and the compiled app would fail with "Cannot find module".
    const { S3Storage } = require("./s3Storage") as typeof import("./s3Storage");
    storage = new S3Storage();
  } else {
    const { DatabaseStorage } = require("./databaseStorage") as typeof import("./databaseStorage");
    storage = new DatabaseStorage();
  }
  instances[provider] = storage;
  return storage;
};

/** Storage adapter for the globally configured provider. */
export const getFileStorage = (): FileStorage => getStorageForProvider(getConfiguredProvider());

/** Test hook: drop cached adapters so env changes take effect. */
export const resetStorageForTests = (): void => {
  delete instances.local;
  delete instances.s3;
};

/**
 * Generate the storage key for a new object: tenant-scoped, collision-free,
 * and free of characters that are awkward in object-store keys.
 */
export const buildStorageKey = (organizationId: number, filename: string): string => {
  const prefix = (process.env.S3_KEY_PREFIX ?? DEFAULT_S3_KEY_PREFIX).replace(/^\/+|\/+$/g, "");
  const safeName = filename.replace(/[^a-zA-Z0-9-_\.]/g, "_");
  const base = `org-${organizationId}/${randomUUID()}-${safeName}`;
  return prefix ? `${prefix}/${base}` : base;
};

/** Minimal shape of a files-table row needed to locate its bytes. */
export interface FileRowWithStorage {
  content?: Buffer | null;
  storage_provider?: string | null;
  storage_key?: string | null;
}

/**
 * Resolve a file row's bytes. Rows with storage_key fetch from the provider
 * recorded on the row (independent of the globally configured provider, so
 * mixed-provider data stays readable); all other rows use the content column.
 * Returns null when the row has no bytes.
 */
export const resolveFileContent = async (row: FileRowWithStorage): Promise<Buffer | null> => {
  if (row.storage_key) {
    const provider = row.storage_provider;
    if (provider !== "local" && provider !== "s3") {
      throw new StorageError("File row references an unknown storage provider.");
    }
    return getStorageForProvider(provider).get(row.storage_key);
  }
  return row.content ?? null;
};
