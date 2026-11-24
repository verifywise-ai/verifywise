/**
 * The Brave Search key queries: the key is stored encrypted, read decrypted, scoped to the
 * organization, and never selected by the settings queries. The statements are checked as text,
 * with the database mocked.
 */
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../encryption.utils", () => ({
  encrypt: jest.fn((text: string) => `enc(${text.length})`),
  decrypt: jest.fn(),
}));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { decrypt, encrypt } from "../encryption.utils";
import logger from "../logger/fileLogger";
import {
  getBraveKeyQuery,
  getVendorResearchSettingsQuery,
  saveBraveKeyQuery,
  saveVendorResearchSettingsQuery,
} from "../vendorResearch.utils";

const query = sequelize.query as unknown as jest.Mock;
const mockDecrypt = decrypt as jest.Mock;
const KEY = "BSAsentinelKey0123456789";
const ORG = 3;
const USER = 8;

function sent(call = 0): { sql: string; options: Record<string, any> } {
  const [sql, options] = query.mock.calls[call] as [string, Record<string, any>];
  return { sql: sql.replace(/\s+/g, " ").trim(), options };
}

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([]);
});

describe("getBraveKeyQuery", () => {
  it("reads the organization's stored key and decrypts it", async () => {
    query.mockResolvedValueOnce([{ brave_api_key_encrypted: "iv:tag:data" }]);
    mockDecrypt.mockReturnValueOnce(KEY);

    await expect(getBraveKeyQuery(ORG)).resolves.toBe(KEY);

    const { sql, options } = sent();
    expect(sql).toBe(
      "SELECT brave_api_key_encrypted FROM vendor_research_settings WHERE organization_id = :organizationId",
    );
    expect(options.replacements).toEqual({ organizationId: ORG });
    expect(mockDecrypt).toHaveBeenCalledWith("iv:tag:data");
  });

  it("answers null when the organization has no settings row or no key", async () => {
    query.mockResolvedValueOnce([]);
    await expect(getBraveKeyQuery(ORG)).resolves.toBeNull();
    query.mockResolvedValueOnce([{ brave_api_key_encrypted: null }]);
    await expect(getBraveKeyQuery(ORG)).resolves.toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("answers null for a stored key that does not decrypt, and logs only the error name", async () => {
    query.mockResolvedValueOnce([{ brave_api_key_encrypted: "iv:tag:data" }]);
    mockDecrypt.mockImplementationOnce(() => {
      const error = new Error(`bad auth tag for ${KEY}`);
      error.name = "DecryptError";
      throw error;
    });

    await expect(getBraveKeyQuery(ORG)).resolves.toBeNull();

    const logged = JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(logged).toContain("DecryptError");
    expect(logged).not.toContain(KEY);
  });
});

describe("saveBraveKeyQuery", () => {
  it("upserts the encrypted key for the organization, as the user", async () => {
    await saveBraveKeyQuery(ORG, KEY, USER);

    const { sql, options } = sent();
    expect(sql).toContain(
      "INSERT INTO vendor_research_settings (organization_id, brave_api_key_encrypted, updated_by, updated_at)",
    );
    expect(sql).toContain("ON CONFLICT (organization_id) DO UPDATE SET");
    expect(sql).toContain("WHERE vendor_research_settings.organization_id = :organizationId");
    // No other choice is touched.
    expect(sql).not.toContain("research_llm_key_id");
    expect(sql).not.toContain("scan_interval_days");
    expect(encrypt).toHaveBeenCalledWith(KEY);
    expect(options.replacements).toEqual({
      organizationId: ORG,
      encrypted: `enc(${KEY.length})`,
      userId: USER,
    });
    expect(JSON.stringify(query.mock.calls)).not.toContain(KEY);
  });

  it("clears the key with null", async () => {
    await saveBraveKeyQuery(ORG, null, USER);

    expect(encrypt).not.toHaveBeenCalled();
    expect(sent().options.replacements).toEqual({
      organizationId: ORG,
      encrypted: null,
      userId: USER,
    });
  });
});

describe("the settings queries", () => {
  it("never select or return the stored key", async () => {
    query.mockResolvedValue([
      {
        research_llm_key_id: 1,
        analysis_llm_key_id: null,
        scan_interval_days: null,
        auto_research_on_create: true,
        brave_api_key_encrypted: "iv:tag:data",
      },
    ]);

    const read = await getVendorResearchSettingsQuery(ORG);
    const saved = await saveVendorResearchSettingsQuery({
      organizationId: ORG,
      userId: USER,
      researchKeyId: 1,
      analysisKeyId: null,
    });

    for (const call of [0, 1]) expect(sent(call).sql).not.toContain("brave");
    expect(JSON.stringify([read, saved])).not.toContain("iv:tag:data");
    expect(Object.keys(read).sort()).toEqual([
      "analysisKeyId",
      "autoResearchOnCreate",
      "researchKeyId",
      "scanIntervalDays",
    ]);
  });
});
