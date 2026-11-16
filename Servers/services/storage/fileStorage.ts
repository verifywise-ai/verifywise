import { PutObjectInput, SignedUrlOptions, StorageObjectRef, StorageProvider } from "./types";

/**
 * Port for file byte storage. Implementations:
 * - DatabaseStorage ("local"): bytes stay in the files.content column; put is
 *   a pass-through and get/delete are no-ops because bytes live and die with
 *   the database row.
 * - S3Storage ("s3"): bytes live in an S3-compatible object store.
 *
 * Callers must treat operations as non-transactional with respect to the
 * database: use the helpers in transactionRegistry.ts to clean up puts on
 * rollback and to defer deletes until after commit.
 */
export interface FileStorage {
  readonly provider: StorageProvider;

  /** Store an object and return where it was put. */
  put(input: PutObjectInput): Promise<StorageObjectRef>;

  /** Retrieve an object's bytes by storage key. */
  get(key: string): Promise<Buffer>;

  /** Delete an object by storage key. Missing objects are not an error. */
  delete(key: string): Promise<void>;

  /**
   * Generate a temporary signed URL for direct access to an object.
   * Throws StorageUnsupportedError for providers without direct-URL access.
   */
  signUrl(key: string, options?: SignedUrlOptions): Promise<string>;
}
