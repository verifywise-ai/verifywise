jest.mock("../../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock("../../../utils/llmKey.utils", () => ({ llmKeyExistsQuery: jest.fn() }));
jest.mock("../../../utils/vendorResearch.utils", () => ({
  saveVendorResearchSettingsQuery: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { llmKeyExistsQuery } from "../../../utils/llmKey.utils";
import { saveVendorResearchSettingsQuery } from "../../../utils/vendorResearch.utils";
import { saveVendorResearchSettings } from "../settings.service";

const asMock = (fn: unknown) => fn as jest.Mock;

const ORG = 3;
const USER = 5;
const TRANSACTION = { id: "the transaction" };

const save = (
  researchKeyId: number | null,
  analysisKeyId: number | null,
  scanIntervalDays?: number | null,
) =>
  saveVendorResearchSettings({
    organizationId: ORG,
    userId: USER,
    researchKeyId,
    analysisKeyId,
    scanIntervalDays,
  });

beforeEach(() => {
  jest.clearAllMocks();
  asMock(sequelize.transaction).mockImplementation(async (work: (t: unknown) => unknown) =>
    work(TRANSACTION),
  );
  asMock(llmKeyExistsQuery).mockResolvedValue(true);
  asMock(saveVendorResearchSettingsQuery).mockImplementation(
    async (input: {
      researchKeyId: number | null;
      analysisKeyId: number | null;
      scanIntervalDays?: number | null;
    }) => ({
      researchKeyId: input.researchKeyId,
      analysisKeyId: input.analysisKeyId,
      scanIntervalDays: input.scanIntervalDays ?? null,
    }),
  );
});

describe("saveVendorResearchSettings", () => {
  it("saves the two choices and answers what was saved", async () => {
    await expect(save(4, 9)).resolves.toEqual({
      ok: true,
      settings: { researchKeyId: 4, analysisKeyId: 9, scanIntervalDays: null },
    });

    expect(saveVendorResearchSettingsQuery).toHaveBeenCalledWith(
      { organizationId: ORG, userId: USER, researchKeyId: 4, analysisKeyId: 9 },
      TRANSACTION,
    );
  });

  it("passes the scan interval on to the query, null for off and nothing for no change", async () => {
    await expect(save(4, null, 14)).resolves.toMatchObject({
      settings: { scanIntervalDays: 14 },
    });
    expect(asMock(saveVendorResearchSettingsQuery).mock.calls[0][0]).toMatchObject({
      scanIntervalDays: 14,
    });

    await save(4, null, null);
    expect(asMock(saveVendorResearchSettingsQuery).mock.calls[1][0].scanIntervalDays).toBeNull();

    await save(4, null);
    expect(
      asMock(saveVendorResearchSettingsQuery).mock.calls[2][0].scanIntervalDays,
    ).toBeUndefined();
  });

  it("saves the scan interval without any key to check", async () => {
    await expect(save(null, null, 7)).resolves.toEqual({
      ok: true,
      settings: { researchKeyId: null, analysisKeyId: null, scanIntervalDays: 7 },
    });

    expect(llmKeyExistsQuery).not.toHaveBeenCalled();
  });

  it("checks each key against the organization, in the transaction that saves", async () => {
    await save(4, 9);

    expect(llmKeyExistsQuery).toHaveBeenCalledTimes(2);
    expect(llmKeyExistsQuery).toHaveBeenCalledWith(4, ORG, TRANSACTION);
    expect(llmKeyExistsQuery).toHaveBeenCalledWith(9, ORG, TRANSACTION);
  });

  it("checks no key for a choice that is null, and still saves it", async () => {
    await expect(save(null, null)).resolves.toEqual({
      ok: true,
      settings: { researchKeyId: null, analysisKeyId: null, scanIntervalDays: null },
    });

    expect(llmKeyExistsQuery).not.toHaveBeenCalled();
    expect(saveVendorResearchSettingsQuery).toHaveBeenCalledTimes(1);
  });

  it("checks a key that is chosen twice once", async () => {
    await save(4, 4);

    expect(llmKeyExistsQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["research", 99, null],
    ["analysis", null, 99],
  ] as const)(
    "refuses a %s key that is not the organization's, and saves nothing",
    async (_label, research, analysis) => {
      asMock(llmKeyExistsQuery).mockResolvedValue(false);

      await expect(save(research, analysis)).resolves.toEqual({ ok: false, reason: "unknown_key" });

      expect(saveVendorResearchSettingsQuery).not.toHaveBeenCalled();
    },
  );

  it("refuses the whole save when only one of two keys is unknown", async () => {
    asMock(llmKeyExistsQuery).mockImplementation(async (id: number) => id === 4);

    await expect(save(4, 99)).resolves.toEqual({ ok: false, reason: "unknown_key" });

    expect(saveVendorResearchSettingsQuery).not.toHaveBeenCalled();
  });

  it("lets a failure of the database reach the caller", async () => {
    asMock(saveVendorResearchSettingsQuery).mockRejectedValue(new Error("down"));

    await expect(save(4, null)).rejects.toThrow("down");
  });
});
