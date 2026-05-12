import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  },
}));

import redisClient from "../../database/redis";
import {
  getFromCache,
  setInCache,
  deleteFromCache,
  deleteByPattern,
  cacheAside,
  buildOrgCacheKey,
  buildTenantCacheKey,
} from "../cache.utils";

const mockRedisGet = redisClient.get as jest.MockedFunction<typeof redisClient.get>;
const mockRedisSetex = redisClient.setex as jest.MockedFunction<typeof redisClient.setex>;
const mockRedisDel = redisClient.del as jest.MockedFunction<typeof redisClient.del>;
const mockRedisKeys = redisClient.keys as jest.MockedFunction<typeof redisClient.keys>;

describe("cache.utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getFromCache", () => {
    it("should return parsed JSON when key is found", async () => {
      mockRedisGet.mockResolvedValue('{"id":1,"name":"test"}');

      const result = await getFromCache<{ id: number; name: string }>("my-key");

      expect(result).toEqual({ id: 1, name: "test" });
      expect(mockRedisGet).toHaveBeenCalledWith("my-key");
    });

    it("should return null when key is not found", async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await getFromCache("missing-key");

      expect(result).toBeNull();
    });

    it("should return null on JSON parse error", async () => {
      mockRedisGet.mockResolvedValue("invalid-json");
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await getFromCache("bad-key");

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("should return null on Redis error", async () => {
      mockRedisGet.mockRejectedValue(new Error("Redis connection lost"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await getFromCache("error-key");

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe("setInCache", () => {
    it("should call redis.setex with key, ttl, and JSON string", async () => {
      mockRedisSetex.mockResolvedValue("OK");

      await setInCache("my-key", { foo: "bar" }, 600);

      expect(mockRedisSetex).toHaveBeenCalledWith("my-key", 600, '{"foo":"bar"}');
    });

    it("should use default TTL (300) when not provided", async () => {
      mockRedisSetex.mockResolvedValue("OK");

      await setInCache("my-key", { foo: "bar" });

      expect(mockRedisSetex).toHaveBeenCalledWith("my-key", 300, '{"foo":"bar"}');
    });

    it("should handle Redis errors gracefully without throwing", async () => {
      mockRedisSetex.mockRejectedValue(new Error("Redis down"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(setInCache("my-key", "value")).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe("deleteFromCache", () => {
    it("should call redis.del with key", async () => {
      mockRedisDel.mockResolvedValue(1);

      await deleteFromCache("my-key");

      expect(mockRedisDel).toHaveBeenCalledWith("my-key");
    });

    it("should handle errors gracefully", async () => {
      mockRedisDel.mockRejectedValue(new Error("Redis error"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(deleteFromCache("my-key")).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe("deleteByPattern", () => {
    it("should get keys by pattern and delete them", async () => {
      mockRedisKeys.mockResolvedValue(["key:1", "key:2"]);
      mockRedisDel.mockResolvedValue(2);

      await deleteByPattern("key:*");

      expect(mockRedisKeys).toHaveBeenCalledWith("key:*");
      expect(mockRedisDel).toHaveBeenCalledWith("key:1", "key:2");
    });

    it("should handle empty keys array without calling del", async () => {
      mockRedisKeys.mockResolvedValue([]);

      await deleteByPattern("key:*");

      expect(mockRedisKeys).toHaveBeenCalledWith("key:*");
      expect(mockRedisDel).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      mockRedisKeys.mockRejectedValue(new Error("Redis error"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(deleteByPattern("key:*")).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe("cacheAside", () => {
    it("should return cached value when found", async () => {
      mockRedisGet.mockResolvedValue('{"cached":true}');
      const computeFn = jest.fn<() => Promise<any>>();

      const result = await cacheAside("my-key", computeFn);

      expect(result).toEqual({ cached: true });
      expect(computeFn).not.toHaveBeenCalled();
    });

    it("should call computeFn and cache result when not found", async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSetex.mockResolvedValue("OK");
      const computeFn = jest.fn<() => Promise<any>>().mockResolvedValue({ computed: true });

      const result = await cacheAside("my-key", computeFn, 600);

      expect(result).toEqual({ computed: true });
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(mockRedisSetex).toHaveBeenCalledWith("my-key", 600, '{"computed":true}');
    });

    it("should throw and not cache when computeFn errors", async () => {
      mockRedisGet.mockResolvedValue(null);
      const computeFn = jest
        .fn<() => Promise<any>>()
        .mockRejectedValue(new Error("Compute failed"));

      await expect(cacheAside("my-key", computeFn)).rejects.toThrow("Compute failed");
      expect(mockRedisSetex).not.toHaveBeenCalled();
    });
  });

  describe("buildOrgCacheKey", () => {
    it("should return correct formatted string", () => {
      const result = buildOrgCacheKey("stats", 42);

      expect(result).toBe("stats:org_42");
    });
  });

  describe("buildTenantCacheKey", () => {
    it("should return correct formatted string", () => {
      const result = buildTenantCacheKey("stats", "tenant-abc");

      expect(result).toBe("stats:tenant-abc");
    });
  });
});
