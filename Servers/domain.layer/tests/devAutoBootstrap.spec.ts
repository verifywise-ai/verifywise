/**
 * @fileoverview devAutoBootstrap unit tests
 *
 * Verifies the dev-only auto-bootstrap helper:
 *   - Hard production guard (never runs in production)
 *   - Flag-off guard (no-op when DEV_AUTO_BOOTSTRAP !== "true")
 *   - Idempotency (skips when organizations already exist)
 *   - Env var validation (fails fast on missing values)
 *   - Happy path (calls org + user creators with correct args, commits txn)
 */

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock("../../utils/organization.utils", () => ({
  createOrganizationQuery: jest.fn(),
}));

jest.mock("../../controllers/user.ctrl", () => ({
  createNewUserWrapper: jest.fn(),
}));

import { sequelize } from "../../database/db";
import { createOrganizationQuery } from "../../utils/organization.utils";
import { createNewUserWrapper } from "../../controllers/user.ctrl";
import { devAutoBootstrap } from "../../utils/devAutoBootstrap";

const mockedSequelize = sequelize as unknown as {
  query: jest.Mock;
  transaction: jest.Mock;
};
const mockedCreateOrg = createOrganizationQuery as jest.Mock;
const mockedCreateUser = createNewUserWrapper as jest.Mock;

const ORIGINAL_ENV = { ...process.env };

const setDevEnv = (overrides: Record<string, string | undefined> = {}) => {
  process.env.NODE_ENV = "development";
  process.env.DEV_AUTO_BOOTSTRAP = "true";
  process.env.DEV_ORG_NAME = "Acme Dev";
  process.env.DEV_ADMIN_EMAIL = "admin@local.dev";
  process.env.DEV_ADMIN_PASSWORD = "Admin123!";
  process.env.DEV_ADMIN_NAME = "Dev";
  process.env.DEV_ADMIN_SURNAME = "Admin";
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
};

const buildTxn = () => ({
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
});

describe("devAutoBootstrap", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.env = { ...ORIGINAL_ENV };
  });

  it("is a no-op in production even when flag is on", async () => {
    setDevEnv();
    process.env.NODE_ENV = "production";

    await devAutoBootstrap();

    expect(mockedSequelize.query).not.toHaveBeenCalled();
    expect(mockedSequelize.transaction).not.toHaveBeenCalled();
    expect(mockedCreateOrg).not.toHaveBeenCalled();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it("is a no-op when DEV_AUTO_BOOTSTRAP is not 'true'", async () => {
    setDevEnv({ DEV_AUTO_BOOTSTRAP: "false" });

    await devAutoBootstrap();

    expect(mockedSequelize.query).not.toHaveBeenCalled();
    expect(mockedCreateOrg).not.toHaveBeenCalled();
  });

  it("skips when at least one organization already exists", async () => {
    setDevEnv();
    mockedSequelize.query.mockResolvedValueOnce([[{ count: 3 }], 1]);

    await devAutoBootstrap();

    expect(mockedSequelize.query).toHaveBeenCalledTimes(1);
    expect(mockedSequelize.transaction).not.toHaveBeenCalled();
    expect(mockedCreateOrg).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[dev-bootstrap] organizations already exist, skipping"
    );
  });

  it("skips silently when a required env var is missing", async () => {
    setDevEnv({ DEV_ADMIN_PASSWORD: undefined });

    await devAutoBootstrap();

    expect(mockedSequelize.query).not.toHaveBeenCalled();
    expect(mockedCreateOrg).not.toHaveBeenCalled();
    expect(mockedCreateUser).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("DEV_ADMIN_PASSWORD")
    );
  });

  it("throws fast when DEV_ADMIN_PASSWORD is too weak", async () => {
    setDevEnv({ DEV_ADMIN_PASSWORD: "weakpass" });
    mockedSequelize.query.mockResolvedValueOnce([[{ count: 0 }], 1]);

    await expect(devAutoBootstrap()).rejects.toThrow(/upper, lower, and digit/);
    expect(mockedCreateOrg).not.toHaveBeenCalled();
  });

  it("creates org + admin in a single transaction on the happy path", async () => {
    setDevEnv();
    mockedSequelize.query.mockResolvedValueOnce([[{ count: 0 }], 1]);
    const txn = buildTxn();
    mockedSequelize.transaction.mockResolvedValueOnce(txn);
    mockedCreateOrg.mockResolvedValueOnce({ id: 42, name: "Acme Dev" });
    mockedCreateUser.mockResolvedValueOnce({ id: 7 });

    await devAutoBootstrap();

    expect(mockedCreateOrg).toHaveBeenCalledTimes(1);
    expect(mockedCreateOrg).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme Dev" }),
      txn
    );
    expect(mockedCreateUser).toHaveBeenCalledTimes(1);
    expect(mockedCreateUser).toHaveBeenCalledWith(
      {
        name: "Dev",
        surname: "Admin",
        email: "admin@local.dev",
        password: "Admin123!",
        roleId: 1,
        organizationId: 42,
      },
      txn
    );
    expect(txn.commit).toHaveBeenCalledTimes(1);
    expect(txn.rollback).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      '[dev-bootstrap] created org "Acme Dev" (id=42) and admin admin@local.dev'
    );
  });

  it("rolls back the transaction when org creation fails", async () => {
    setDevEnv();
    mockedSequelize.query.mockResolvedValueOnce([[{ count: 0 }], 1]);
    const txn = buildTxn();
    mockedSequelize.transaction.mockResolvedValueOnce(txn);
    mockedCreateOrg.mockRejectedValueOnce(new Error("db down"));

    await expect(devAutoBootstrap()).rejects.toThrow("db down");
    expect(txn.rollback).toHaveBeenCalledTimes(1);
    expect(txn.commit).not.toHaveBeenCalled();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });
});
