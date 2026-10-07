/**
 * Junk ids must be refused, not salvaged.
 *
 * Every endpoint here parsed its id with `parseInt`, which returns a numeric
 * PREFIX: `"12abc"`, `[12]` and `12.9` all became 12. The `isNaN` guard sitting
 * right beside each call therefore never fired, and the request went on to act
 * on record 12 — a record the caller never named. The assertion that matters is
 * not the 400 on its own but the 400 *together with* an unused query mock: the
 * proof that record 12 was left alone.
 */
import { getValidations, getFindings, setModelRoles } from "../mrm.ctrl";
import { getThresholds, createIngestionToken } from "../mrmMonitoring.ctrl";
import { reviewContent } from "../aiContent.ctrl";
import { getValidationsQuery, getFindingsQuery, setModelRolesQuery } from "../../utils/mrm.utils";
import { getThresholdsQuery } from "../../utils/mrmMonitoring.utils";
import { markReviewedQuery } from "../../utils/aiContent.utils";
import { MrmModelRole } from "../../domain.layer/enums/mrm.enum";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../utils/mrm.utils");
jest.mock("../../utils/mrmMonitoring.utils");
jest.mock("../../utils/mrmSettings.utils");
jest.mock("../../utils/mrmAlerts.utils");
jest.mock("../../utils/mrmRevalidation.utils");
jest.mock("../../utils/aiContent.utils");
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

/** `req.t` is the i18n shim the controllers call on every error string. */
const mockReq = (over: Record<string, any> = {}): any => ({
  query: {},
  params: {},
  body: {},
  organizationId: 1,
  userId: 1,
  t: (s: string) => s,
  ...over,
});

const mockRes = (): any => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

/** The shapes a salvaging parse used to accept. `12` is the record they hit. */
const JUNK: [string, unknown][] = [
  ["trailing text", "12abc"],
  ["array", ["12"]],
  ["float", 12.9],
  ["hex-ish", "12e0"],
  ["leading plus", "+12"],
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("query-string ids", () => {
  it.each(JUNK)("getValidations refuses a %s modelId without querying", async (_label, raw) => {
    const res = mockRes();
    await getValidations(mockReq({ query: { modelId: raw } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getValidationsQuery).not.toHaveBeenCalled();
  });

  it.each(JUNK)("getFindings refuses a %s modelId without querying", async (_label, raw) => {
    const res = mockRes();
    await getFindings(mockReq({ query: { modelId: raw } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getFindingsQuery).not.toHaveBeenCalled();
  });

  it("getFindings refuses a junk validationId too", async () => {
    const res = mockRes();
    await getFindings(mockReq({ query: { validationId: "12abc" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getFindingsQuery).not.toHaveBeenCalled();
  });

  it.each(JUNK)("getThresholds refuses a %s modelId without querying", async (_label, raw) => {
    const res = mockRes();
    await getThresholds(mockReq({ query: { modelId: raw } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getThresholdsQuery).not.toHaveBeenCalled();
  });

  it("still accepts a clean numeric string, as a query string always produces", async () => {
    (getValidationsQuery as jest.Mock).mockResolvedValue([]);
    const res = mockRes();
    await getValidations(mockReq({ query: { modelId: "12" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getValidationsQuery).toHaveBeenCalledWith(1, 12);
  });

  it("leaves the modelId=0 path exactly as it was", async () => {
    // "0" is truthy as a string, so it reaches the parse; it is falsy as a
    // number, so `modelId` is 0 and not NaN. The filter is applied, not skipped.
    (getValidationsQuery as jest.Mock).mockResolvedValue([]);
    const res = mockRes();
    await getValidations(mockReq({ query: { modelId: "0" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getValidationsQuery).toHaveBeenCalledWith(1, 0);
  });

  it("treats an absent modelId as no filter", async () => {
    (getValidationsQuery as jest.Mock).mockResolvedValue([]);
    const res = mockRes();
    await getValidations(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getValidationsQuery).toHaveBeenCalledWith(1, undefined);
  });
});

describe("URL-param ids", () => {
  it.each(JUNK)("reviewContent refuses a %s id without writing", async (_label, raw) => {
    const res = mockRes();
    await reviewContent(mockReq({ params: { id: raw }, body: { review_action: "approved" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(markReviewedQuery).not.toHaveBeenCalled();
  });

  it("still reviews the content named by a clean id", async () => {
    (markReviewedQuery as jest.Mock).mockResolvedValue({ id: 12 });
    const res = mockRes();
    await reviewContent(
      mockReq({ params: { id: "12" }, body: { review_action: "approved" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(markReviewedQuery).toHaveBeenCalledWith(12, 1, expect.anything());
  });
});

describe("request-body ids", () => {
  it.each(JUNK)("createIngestionToken refuses a %s model id", async (_label, raw) => {
    const res = mockRes();
    await createIngestionToken(mockReq({ body: { name: "t", model_inventory_id: raw } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each(JUNK)("setModelRoles refuses a %s user id without writing", async (_label, raw) => {
    const res = mockRes();
    await setModelRoles(
      mockReq({
        params: { modelId: "12" },
        body: { assignments: [{ role: MrmModelRole.OWNER, user_id: raw }] },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(setModelRolesQuery).not.toHaveBeenCalled();
  });

  it.each(JUNK.filter(([label]) => label !== "array"))(
    "setModelRoles refuses a %s modelId in the URL",
    async (_label, raw) => {
      const res = mockRes();
      await setModelRoles(mockReq({ params: { modelId: raw }, body: { assignments: [] } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(setModelRolesQuery).not.toHaveBeenCalled();
    },
  );

  it("unwraps a repeated URL param rather than rejecting it", async () => {
    // `parseId` takes the first element of an array param, which is what
    // Express hands over for `?modelId=12&modelId=13`. That is deliberate, so
    // the array shape stays valid here — it reaches the existence check and
    // 404s on the mock, rather than failing the id guard.
    const res = mockRes();
    await setModelRoles(mockReq({ params: { modelId: ["12"] }, body: { assignments: [] } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(setModelRolesQuery).not.toHaveBeenCalled();
  });
});
