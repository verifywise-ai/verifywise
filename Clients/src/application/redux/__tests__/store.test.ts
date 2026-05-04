import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub __APP_VERSION__ before importing the store module
vi.stubGlobal("__APP_VERSION__", "1.0.0-test");

// Mock redux-persist storage
vi.mock("redux-persist/es/storage", () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
}));

// Mock localStorage for checkVersionAndClearIfNeeded
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("Redux Store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export store and persistor", async () => {
    const storeModule = await import("../store");
    expect(storeModule.store).toBeDefined();
    expect(storeModule.persistor).toBeDefined();
  });

  it("should have expected reducer keys (ui, auth, files)", async () => {
    const { store } = await import("../store");
    const state = store.getState();
    expect(state).toHaveProperty("ui");
    expect(state).toHaveProperty("auth");
    expect(state).toHaveProperty("files");
  });

  it("should support dispatching actions", async () => {
    const { store } = await import("../store");
    expect(typeof store.dispatch).toBe("function");

    // Dispatching a no-op action should not throw
    expect(() => {
      store.dispatch({ type: "TEST_ACTION" });
    }).not.toThrow();
  });

  it("should have RootState that includes expected slices", async () => {
    const { store } = await import("../store");
    const state: ReturnType<typeof store.getState> = store.getState();

    // Verify each slice exists and is an object
    expect(typeof state.ui).not.toBe("undefined");
    expect(typeof state.auth).not.toBe("undefined");
    expect(typeof state.files).not.toBe("undefined");
  });

  it("should have a persistor with persist and purge methods", async () => {
    const { persistor } = await import("../store");
    expect(typeof persistor.persist).toBe("function");
    expect(typeof persistor.purge).toBe("function");
  });
});

describe("checkVersionAndClearIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.resetModules();
    vi.stubGlobal("__APP_VERSION__", "1.0.0-test");
  });

  it("should set the version in localStorage on first run", async () => {
    await import("../store");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("root_version", "1.0.0-test");
  });

  it("should clear persist: keys when version changes", async () => {
    // Pre-populate localStorage with a different version and persist keys
    localStorageMock.setItem("root_version", "0.9.0-old");
    localStorageMock.setItem("persist:root", '{"some":"data"}');

    // Override keys to include persist: keys
    const originalKeys = Object.keys;
    vi.spyOn(Object, "keys").mockImplementation((obj) => {
      if (obj === localStorage) {
        return ["root_version", "persist:root"];
      }
      return originalKeys(obj);
    });

    await import("../store");

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("persist:root");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("root_version", "1.0.0-test");

    vi.restoreAllMocks();
  });

  it("should not clear persist: keys when version matches", async () => {
    localStorageMock.setItem("root_version", "1.0.0-test");

    await import("../store");

    // removeItem should not have been called for persist: keys
    const removeItemCalls = localStorageMock.removeItem.mock.calls.filter((call: string[]) =>
      call[0]?.startsWith("persist:"),
    );
    expect(removeItemCalls).toHaveLength(0);
  });
});
