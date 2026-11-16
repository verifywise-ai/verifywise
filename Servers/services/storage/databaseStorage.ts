import { FileStorage } from "./fileStorage";
import {
  PutObjectInput,
  SignedUrlOptions,
  StorageObjectRef,
  StorageProvider,
  StorageUnsupportedError,
} from "./types";

/**
 * Default provider ("local"): file bytes remain in the files.content column,
 * exactly the historical behavior. There is no separate object store, so:
 * - put returns a keyless ref; the caller writes the buffer into the row as
 *   it always has.
 * - delete is a no-op: bytes die with the row.
 * - get and signUrl are unsupported: bytes are read from the row, and
 *   downloads go through the existing authorized API endpoints — the app has
 *   no direct-URL access pattern for this provider.
 */
export class DatabaseStorage implements FileStorage {
  readonly provider: StorageProvider = "local";

  async put(_input: PutObjectInput): Promise<StorageObjectRef> {
    return { provider: this.provider, key: null };
  }

  async get(_key: string): Promise<Buffer> {
    throw new StorageUnsupportedError(
      "The local provider stores bytes in the files.content column; read them from the file row.",
    );
  }

  async delete(_key: string): Promise<void> {
    // No-op: bytes live and die with the files row.
  }

  async signUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    throw new StorageUnsupportedError(
      "Signed URLs are not supported by the local storage provider.",
    );
  }
}
