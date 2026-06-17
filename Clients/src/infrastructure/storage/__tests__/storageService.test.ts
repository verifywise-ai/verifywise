import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageService } from "../storageService";
import { KEYS, NAMESPACE, dynamicKeys } from "../storageKeys";

describe("StorageService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("typed accessors (get/set/removeKey)", () => {
    it("round-trips a JSON-valued typed key under its namespaced key", () => {
      const svc = new StorageService();
      svc.set("preferences", { date_format: "MM-DD-YYYY" });

      expect(svc.get("preferences", {})).toEqual({ date_format: "MM-DD-YYYY" });
      // Persisted as JSON under the canonical namespaced key.
      expect(localStorage.getItem("verifywise_preferences")).toBe(
        JSON.stringify({ date_format: "MM-DD-YYYY" }),
      );
    });

    it("stores a `raw` typed key as a bare (unquoted) string", () => {
      const svc = new StorageService();
      svc.set("tasksViewTab", "deadline");

      expect(localStorage.getItem(KEYS.tasksViewTab.key)).toBe("deadline");
      expect(svc.get("tasksViewTab", "list")).toBe("deadline");
    });

    it("returns the fallback when the key is absent", () => {
      const svc = new StorageService();
      expect(svc.get("preferences", { date_format: "DD-MM-YYYY" })).toEqual({
        date_format: "DD-MM-YYYY",
      });
    });

    it("removeKey deletes the canonical key", () => {
      const svc = new StorageService();
      svc.set("tasksViewTab", "deadline");
      svc.removeKey("tasksViewTab");
      expect(localStorage.getItem(KEYS.tasksViewTab.key)).toBeNull();
    });
  });

  describe("raw accessors (getRaw/setRaw/remove)", () => {
    it("round-trips JSON values by default", () => {
      const svc = new StorageService();
      svc.setRaw("verifywise_obj", { a: 1, b: [2, 3] });
      expect(svc.getRaw("verifywise_obj", null)).toEqual({ a: 1, b: [2, 3] });
    });

    it("preserves null and primitive JSON values", () => {
      const svc = new StorageService();
      svc.setRaw("verifywise_null", null);
      svc.setRaw("verifywise_num", 42);
      expect(svc.getRaw<null>("verifywise_null", undefined as never)).toBeNull();
      expect(svc.getRaw("verifywise_num", 0)).toBe(42);
    });

    it("does not JSON-encode/decode `raw` values", () => {
      const svc = new StorageService();
      svc.setRaw("verifywise_mode", "card", { raw: true });
      // Stored exactly, not as "\"card\"".
      expect(localStorage.getItem("verifywise_mode")).toBe("card");
      expect(svc.getRaw("verifywise_mode", "table", { raw: true })).toBe("card");
    });

    it("returns the fallback on corrupt JSON without throwing", () => {
      const svc = new StorageService();
      localStorage.setItem("verifywise_bad", "{not valid json");
      expect(() => svc.getRaw("verifywise_bad", { ok: true })).not.toThrow();
      expect(svc.getRaw("verifywise_bad", { ok: true })).toEqual({ ok: true });
    });

    it("remove deletes a raw key", () => {
      const svc = new StorageService();
      svc.setRaw("verifywise_tmp", "x", { raw: true });
      svc.remove("verifywise_tmp");
      expect(localStorage.getItem("verifywise_tmp")).toBeNull();
    });
  });

  describe("dynamic key factories", () => {
    it("produce fully namespaced key strings", () => {
      expect(dynamicKeys.paginationRows("users")).toBe("verifywise_pagination_rows_users");
      expect(dynamicKeys.sorting("vendors")).toBe("verifywise_vendors_sorting");
      expect(dynamicKeys.columns("files")).toBe("verifywise_columns_files");
      expect(dynamicKeys.deadlineSnooze(7)).toBe("verifywise_deadline_snooze_7");
    });
  });

  describe("legacy-key migration", () => {
    it("migrates a legacy value to the canonical key once, then removes the legacy key", () => {
      const legacy = { riskMetrics: { data: 1, timestamp: 99 } };
      localStorage.setItem("dashboard_metrics_cache", JSON.stringify(legacy));

      const svc = new StorageService();
      expect(svc.get("dashboardMetricsCache", {})).toEqual(legacy);

      // Copied to canonical key; legacy key dropped.
      expect(localStorage.getItem("verifywise_dashboard_metrics_cache")).toBe(
        JSON.stringify(legacy),
      );
      expect(localStorage.getItem("dashboard_metrics_cache")).toBeNull();
    });

    it("ignores the legacy key when the canonical key already exists", () => {
      localStorage.setItem("dashboard_metrics_cache", JSON.stringify({ stale: true }));
      const svc = new StorageService();
      svc.set("dashboardMetricsCache", { riskMetrics: { data: 5, timestamp: 1 } });

      expect(svc.get("dashboardMetricsCache", {})).toEqual({
        riskMetrics: { data: 5, timestamp: 1 },
      });
      // Legacy key is left untouched (canonical already present, no migration).
      expect(localStorage.getItem("dashboard_metrics_cache")).toBe(JSON.stringify({ stale: true }));
    });

    it("returns the fallback when neither the canonical nor the legacy key exists", () => {
      const svc = new StorageService();
      expect(svc.get("dashboardMetricsCache", {})).toEqual({});
      expect(localStorage.getItem("verifywise_dashboard_metrics_cache")).toBeNull();
    });
  });

  describe("clearNamespace", () => {
    it("removes only verifywise_* keys, leaving auth/redux-persist keys intact", () => {
      const svc = new StorageService();
      svc.set("tasksViewTab", "deadline");
      svc.setRaw("verifywise_other", "y", { raw: true });
      localStorage.setItem("token", "jwt");
      localStorage.setItem("persist:root", "{}");

      svc.clearNamespace();

      expect(localStorage.getItem(KEYS.tasksViewTab.key)).toBeNull();
      expect(localStorage.getItem("verifywise_other")).toBeNull();
      expect(localStorage.getItem("token")).toBe("jwt");
      expect(localStorage.getItem("persist:root")).toBe("{}");
    });

    it("clears namespaced keys from the in-memory backend (no window)", () => {
      vi.stubGlobal("window", undefined);
      const svc = new StorageService();
      svc.set("tasksViewTab", "deadline");
      svc.setRaw("token", "jwt", { raw: true });

      svc.clearNamespace();

      expect(svc.get("tasksViewTab", "list")).toBe("list"); // namespaced -> removed
      expect(svc.getRaw("token", null, { raw: true })).toBe("jwt"); // un-namespaced -> kept
    });

    it("does not throw when key enumeration fails", () => {
      const svc = new StorageService();
      svc.set("tasksViewTab", "deadline");
      vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
        throw new Error("enumeration blocked");
      });
      expect(() => svc.clearNamespace()).not.toThrow();
    });
  });

  describe("sandbox / unavailable storage fallback", () => {
    it("falls back to memory when the constructor probe throws, never throwing", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage disabled");
      });

      const svc = new StorageService();
      expect(() => svc.set("tasksViewTab", "deadline")).not.toThrow();
      // Round-trips via the in-memory backend.
      expect(svc.get("tasksViewTab", "list")).toBe("deadline");
      // Nothing was written to the real (throwing) localStorage.
      expect(localStorage.getItem(KEYS.tasksViewTab.key)).toBeNull();
    });

    it("returns the fallback (no throw) when getItem throws after construction", () => {
      const svc = new StorageService();
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("read blocked");
      });
      expect(() => svc.get("preferences", { date_format: "DD" })).not.toThrow();
      expect(svc.get("preferences", { date_format: "DD" })).toEqual({ date_format: "DD" });
    });

    it("swallows a mid-session setItem failure (quota) and degrades to the fallback", () => {
      const svc = new StorageService();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      // No throw; the write is dropped, so a subsequent read returns the fallback.
      expect(() => svc.set("preferences", { date_format: "X" })).not.toThrow();
      expect(svc.get("preferences", { date_format: "fallback" })).toEqual({
        date_format: "fallback",
      });
    });
  });

  describe("SSR (no window)", () => {
    it("uses the in-memory backend for get/set/remove when window is undefined", () => {
      vi.stubGlobal("window", undefined);

      const svc = new StorageService();
      expect(() => svc.set("tasksViewTab", "deadline")).not.toThrow();
      expect(svc.get("tasksViewTab", "list")).toBe("deadline");

      svc.removeKey("tasksViewTab");
      expect(svc.get("tasksViewTab", "list")).toBe("list");
    });

    it("swallows a removeItem failure", () => {
      const svc = new StorageService();
      svc.setRaw("verifywise_tmp", "x", { raw: true });
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("remove blocked");
      });
      expect(() => svc.remove("verifywise_tmp")).not.toThrow();
    });
  });

  describe("namespace constant", () => {
    it("matches the prefix used by the registry and factories", () => {
      expect(NAMESPACE).toBe("verifywise_");
      expect(KEYS.preferences.key.startsWith(NAMESPACE)).toBe(true);
    });
  });
});
