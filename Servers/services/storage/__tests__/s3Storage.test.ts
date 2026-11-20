import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetSignedUrl = jest.fn<any>();
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
}));

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadS3Config, S3Storage, S3StorageConfig } from "../s3Storage";
import { StorageConfigError, StorageError, StorageNotFoundError } from "../types";

const BASE_CONFIG: S3StorageConfig = {
  bucket: "verifywise-files",
  region: "us-east-1",
  endpoint: "http://minio:9000",
  forcePathStyle: true,
  signedUrlTtlSeconds: 900,
  credentials: { accessKeyId: "test-key-id", secretAccessKey: "test-secret" },
};

describe("loadS3Config", () => {
  it("requires S3_BUCKET", () => {
    expect(() => loadS3Config({})).toThrow(StorageConfigError);
    expect(() => loadS3Config({})).toThrow(/S3_BUCKET/);
  });

  it("requires access key and secret to be set as a pair", () => {
    expect(() => loadS3Config({ S3_BUCKET: "b", S3_ACCESS_KEY_ID: "x" })).toThrow(
      /must be set together/,
    );
    expect(() => loadS3Config({ S3_BUCKET: "b", S3_SECRET_ACCESS_KEY: "x" })).toThrow(
      /must be set together/,
    );
  });

  it("rejects a non-positive or non-integer signed URL TTL", () => {
    for (const ttl of ["-5", "0", "abc", "1.5"]) {
      expect(() => loadS3Config({ S3_BUCKET: "b", S3_SIGNED_URL_TTL_SECONDS: ttl })).toThrow(
        /positive integer/,
      );
    }
  });

  it("rejects a non-boolean S3_FORCE_PATH_STYLE", () => {
    expect(() => loadS3Config({ S3_BUCKET: "b", S3_FORCE_PATH_STYLE: "perhaps" })).toThrow(
      /boolean/,
    );
  });

  it("applies defaults: region us-east-1, TTL 900, default credential chain", () => {
    const cfg = loadS3Config({ S3_BUCKET: "b" });
    expect(cfg.region).toBe("us-east-1");
    expect(cfg.signedUrlTtlSeconds).toBe(900);
    expect(cfg.credentials).toBeUndefined();
    expect(cfg.endpoint).toBeUndefined();
    // AWS proper defaults to virtual-hosted style.
    expect(cfg.forcePathStyle).toBe(false);
  });

  it("defaults to path-style addressing when a custom endpoint is set", () => {
    expect(loadS3Config({ S3_BUCKET: "b", S3_ENDPOINT: "http://minio:9000" }).forcePathStyle).toBe(
      true,
    );
    expect(
      loadS3Config({
        S3_BUCKET: "b",
        S3_ENDPOINT: "http://minio:9000",
        S3_FORCE_PATH_STYLE: "false",
      }).forcePathStyle,
    ).toBe(false);
  });

  it("accepts paired credentials and a valid TTL", () => {
    const cfg = loadS3Config({
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "a",
      S3_SECRET_ACCESS_KEY: "s",
      S3_REGION: "eu-west-1",
      S3_SIGNED_URL_TTL_SECONDS: "60",
    });
    expect(cfg.credentials).toEqual({ accessKeyId: "a", secretAccessKey: "s" });
    expect(cfg.region).toBe("eu-west-1");
    expect(cfg.signedUrlTtlSeconds).toBe(60);
  });
});

describe("S3Storage", () => {
  let send: jest.Mock<any>;
  let storage: S3Storage;

  beforeEach(() => {
    send = jest.fn<any>();
    storage = new S3Storage(BASE_CONFIG, { send } as any);
    mockGetSignedUrl.mockReset();
  });

  it("reports the s3 provider", () => {
    expect(storage.provider).toBe("s3");
  });

  describe("put", () => {
    it("uploads with bucket, key, body and content type, and returns the key ref", async () => {
      send.mockResolvedValueOnce({});
      const body = Buffer.from("pdf-bytes");

      const ref = await storage.put({
        key: "files/org-1/a.pdf",
        body,
        contentType: "application/pdf",
      });

      expect(ref).toEqual({ provider: "s3", key: "files/org-1/a.pdf" });
      const command = send.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: "verifywise-files",
        Key: "files/org-1/a.pdf",
        Body: body,
        ContentType: "application/pdf",
      });
    });

    it("wraps upload failures without leaking credentials", async () => {
      send.mockRejectedValueOnce(new Error("network down for test-secret"));
      await expect(
        storage.put({ key: "k", body: Buffer.from("x"), contentType: "text/plain" }),
      ).rejects.toMatchObject({
        name: "StorageError",
        message: "Failed to upload file to object storage.",
      });
      try {
        send.mockRejectedValueOnce(new Error("network down for test-secret"));
        await storage.put({ key: "k", body: Buffer.from("x"), contentType: "text/plain" });
      } catch (error) {
        expect((error as Error).message).not.toContain("test-secret");
      }
    });
  });

  describe("get", () => {
    it("downloads the object bytes", async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      send.mockResolvedValueOnce({ Body: { transformToByteArray: async () => bytes } });

      const result = await storage.get("files/org-1/a.pdf");

      expect(result).toEqual(Buffer.from(bytes));
      const command = send.mock.calls[0][0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toMatchObject({ Bucket: "verifywise-files", Key: "files/org-1/a.pdf" });
    });

    it("maps NoSuchKey to StorageNotFoundError", async () => {
      send.mockRejectedValueOnce(Object.assign(new Error("no key"), { name: "NoSuchKey" }));
      await expect(storage.get("missing")).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it("maps HTTP 404 to StorageNotFoundError", async () => {
      send.mockRejectedValueOnce(
        Object.assign(new Error("nf"), { $metadata: { httpStatusCode: 404 } }),
      );
      await expect(storage.get("missing")).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it("maps a missing body to StorageNotFoundError", async () => {
      send.mockResolvedValueOnce({});
      await expect(storage.get("empty")).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it("wraps other failures as StorageError", async () => {
      send.mockRejectedValueOnce(new Error("timeout"));
      await expect(storage.get("k")).rejects.toMatchObject({ name: "StorageError" });
    });
  });

  describe("delete", () => {
    it("deletes the object and treats a missing object as success", async () => {
      send.mockResolvedValueOnce({});
      await expect(storage.delete("files/org-1/a.pdf")).resolves.toBeUndefined();
      const command = send.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toMatchObject({ Bucket: "verifywise-files", Key: "files/org-1/a.pdf" });
    });

    it("wraps delete failures as StorageError", async () => {
      send.mockRejectedValueOnce(new Error("denied"));
      await expect(storage.delete("k")).rejects.toMatchObject({ name: "StorageError" });
    });
  });

  describe("signUrl", () => {
    it("uses the configured TTL by default", async () => {
      mockGetSignedUrl.mockResolvedValueOnce("http://minio:9000/signed");
      const url = await storage.signUrl("files/org-1/a.pdf");

      expect(url).toBe("http://minio:9000/signed");
      const [client, command, options] = mockGetSignedUrl.mock.calls[0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toMatchObject({ Bucket: "verifywise-files", Key: "files/org-1/a.pdf" });
      expect(options).toEqual({ expiresIn: 900 });
      expect(client).toBeDefined();
    });

    it("honours a per-call TTL override", async () => {
      mockGetSignedUrl.mockResolvedValueOnce("http://minio:9000/signed");
      await storage.signUrl("k", { expiresInSeconds: 60 });
      expect(mockGetSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 60 });
    });

    it("wraps signing failures as StorageError", async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error("no credentials"));
      await expect(storage.signUrl("k")).rejects.toMatchObject({ name: "StorageError" });
    });
  });
});
