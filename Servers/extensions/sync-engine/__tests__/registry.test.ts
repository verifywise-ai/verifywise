import {
  __resetSyncProvidersForTests,
  findSyncProvider,
  getSyncProvider,
  listSyncProviders,
  registerSyncProvider,
  statusKinds,
} from "../registry";
import { UnknownSyncProviderError } from "../errors";
import type { SyncProvider } from "../types";

const make = (overrides: Partial<SyncProvider> = {}): SyncProvider => ({
  key: "demo-ext",
  kinds: ["manual", "scheduled"],
  scheduledKind: "scheduled",
  readiness: async () => ({ ready: true }),
  run: async () => ({ counts: {} }),
  ...overrides,
});

beforeEach(() => __resetSyncProvidersForTests());

describe("registerSyncProvider", () => {
  it.each(["Jira", "jira_assets", "", "a b", "../x"])("rejects the key %p", (key) => {
    expect(() => registerSyncProvider(make({ key }))).toThrow("Invalid sync provider key");
  });

  it("requires a manual kind", () => {
    expect(() => registerSyncProvider(make({ kinds: ["scheduled"] }))).toThrow(
      'must declare the "manual" kind',
    );
  });

  it("requires the scheduled kind to be one of its kinds", () => {
    expect(() => registerSyncProvider(make({ scheduledKind: "nightly" }))).toThrow(
      'scheduledKind "nightly" is not one of its kinds',
    );
  });

  it("rejects a second, different provider for the same key", () => {
    const first = make();
    registerSyncProvider(first);
    expect(() => registerSyncProvider(first)).not.toThrow();
    expect(() => registerSyncProvider(make())).toThrow("already registered");
    expect(listSyncProviders()).toEqual([first]);
  });
});

describe("lookups", () => {
  it("throws for an unknown key on get, and returns undefined on find", () => {
    expect(() => getSyncProvider("nope")).toThrow(UnknownSyncProviderError);
    expect(findSyncProvider("nope")).toBeUndefined();
  });

  it("status kinds are the scheduled kind and manual", () => {
    expect(statusKinds(make())).toEqual(["scheduled", "manual"]);
    expect(statusKinds(make({ scheduledKind: undefined }))).toEqual(["manual"]);
  });
});
