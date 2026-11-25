import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileStorage } from "./fileStorage";
import {
  PutObjectInput,
  SignedUrlOptions,
  StorageConfigError,
  StorageError,
  StorageNotFoundError,
  StorageObjectRef,
  StorageProvider,
} from "./types";

/**
 * S3-compatible object storage provider ("s3"). Works with AWS S3 and
 * S3-compatible services (MinIO, Wasabi, etc.) via a custom endpoint.
 *
 * Configuration (environment variables, see loadS3Config):
 * - S3_BUCKET (required)
 * - S3_ENDPOINT (optional; omit for AWS)
 * - S3_REGION (optional, default us-east-1)
 * - S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (optional as a pair; when both
 *   are unset the default AWS credential chain is used)
 * - S3_FORCE_PATH_STYLE (optional; default true when S3_ENDPOINT is set)
 * - S3_SIGNED_URL_TTL_SECONDS (optional, default 900)
 *
 * Error messages never include credentials or other sensitive configuration.
 */

const DEFAULT_REGION = "us-east-1";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/** Parse and validate S3 configuration. Error messages name missing or
 * invalid variables only — never their values. */
export const loadS3Config = (env: NodeJS.ProcessEnv = process.env): S3StorageConfig => {
  const bucket = env.S3_BUCKET?.trim();
  if (!bucket) {
    throw new StorageConfigError(
      "S3 storage is configured (STORAGE_PROVIDER=s3) but S3_BUCKET is not set.",
    );
  }

  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new StorageConfigError(
      "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together, or both left unset to use the default AWS credential chain.",
    );
  }

  let signedUrlTtlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS;
  const rawTtl = env.S3_SIGNED_URL_TTL_SECONDS?.trim();
  if (rawTtl) {
    const parsed = Number(rawTtl);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      throw new StorageConfigError("S3_SIGNED_URL_TTL_SECONDS must be a positive integer.");
    }
    signedUrlTtlSeconds = parsed;
  }

  const endpoint = env.S3_ENDPOINT?.trim() || undefined;

  let forcePathStyle: boolean;
  const rawPathStyle = env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
  if (rawPathStyle !== undefined && rawPathStyle !== "") {
    if (!["1", "true", "yes", "0", "false", "no"].includes(rawPathStyle)) {
      throw new StorageConfigError("S3_FORCE_PATH_STYLE must be a boolean value (true/false).");
    }
    forcePathStyle = ["1", "true", "yes"].includes(rawPathStyle);
  } else {
    // Most S3-compatible providers require path-style addressing.
    forcePathStyle = endpoint !== undefined;
  }

  return {
    bucket,
    region: env.S3_REGION?.trim() || DEFAULT_REGION,
    endpoint,
    forcePathStyle,
    signedUrlTtlSeconds,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  };
};

const isNotFound = (error: unknown): boolean => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
};

export class S3Storage implements FileStorage {
  readonly provider: StorageProvider = "s3";

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: S3StorageConfig = loadS3Config(), client?: S3Client) {
    this.bucket = config.bucket;
    this.signedUrlTtlSeconds = config.signedUrlTtlSeconds;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
  }

  async put(input: PutObjectInput): Promise<StorageObjectRef> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
      return { provider: this.provider, key: input.key };
    } catch (error) {
      throw new StorageError("Failed to upload file to object storage.", this.provider, error);
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) {
        throw new StorageNotFoundError("Stored file is empty or missing.", key);
      }
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof StorageNotFoundError) throw error;
      if (isNotFound(error)) {
        throw new StorageNotFoundError("Stored file not found.", key);
      }
      throw new StorageError("Failed to retrieve file from object storage.", this.provider, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // S3 deletes are idempotent: a missing object is not an error.
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw new StorageError("Failed to delete file from object storage.", this.provider, error);
    }
  }

  async signUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        {
          expiresIn: options?.expiresInSeconds ?? this.signedUrlTtlSeconds,
        },
      );
    } catch (error) {
      throw new StorageError("Failed to generate signed URL.", this.provider, error);
    }
  }
}
