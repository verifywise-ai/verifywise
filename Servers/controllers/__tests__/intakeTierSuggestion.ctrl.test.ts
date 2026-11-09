import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../services/intakeLiveChecks/formBudget", () => ({
  consumeFormBudget: jest.fn<any>(),
  FORM_BUDGET_PER_HOUR: { checks: 300, prefill: 20, explain: 100 },
}));
jest.mock("../../utils/llmKey.utils", () => ({ getLLMKeyWithKeyByIdQuery: jest.fn<any>() }));
jest.mock("../../advisor/llmModelFactory", () => ({ createModelFromKey: jest.fn(() => ({})) }));
jest.mock("../../utils/intakeTierSuggestion.utils", () => ({
  getTierSuggestionResponseQuery: jest.fn<any>(),
}));
jest.mock("../../services/intakeTierSuggestion", () => {
  const actual = jest.requireActual<any>("../../services/intakeTierSuggestion");
  return { ...actual, explainTier: jest.fn<any>() };
});
jest.mock("../../utils/i18n.utils", () => ({ translateRequest: (_req: unknown, k: string) => k }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  getSubmissionTierSuggestionResponse,
  MAX_TIER_CONTEXT_CHARS,
  postPublicTierExplanation,
  postPublicTierSuggestion,
  takeTierSuggestionResponse,
} from "../intakeTierSuggestion.ctrl";
import { consumeFormBudget } from "../../services/intakeLiveChecks/formBudget";
import { getLLMKeyWithKeyByIdQuery } from "../../utils/llmKey.utils";
import { explainTier } from "../../services/intakeTierSuggestion";
import { getTierSuggestionResponseQuery } from "../../utils/intakeTierSuggestion.utils";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

const ANSWERS = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["interacts"],
};

const AI_FORM = { id: 7, euAiActRiskStepEnabled: true, liveChecksEnabled: true, llmKeyId: 3 };

function createRes(form: object = AI_FORM): any {
  const res: any = { locals: { intakeForm: { form, organizationId: 2 } } };
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  res.set = jest.fn<any>().mockReturnValue(res);
  return res;
}
const req = (body: unknown, extra: object = {}): any => ({
  body,
  t: (k: string) => k,
  ...extra,
});
const payload = (res: any) => res.json.mock.calls[0][0].data ?? res.json.mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("postPublicTierSuggestion", () => {
  it("returns the rules engine's level and references", async () => {
    const res = createRes();
    await postPublicTierSuggestion(req({ answers: ANSWERS }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(payload(res)).toMatchObject({ level: "Limited risk", questionnaireVersion: 2 });
  });

  it("answers 404 for a form without the risk step", async () => {
    const res = createRes({ id: 7, euAiActRiskStepEnabled: false });
    await postPublicTierSuggestion(req({ answers: ANSWERS }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("answers 400 for invalid answers", async () => {
    const res = createRes();
    await postPublicTierSuggestion(req({ answers: { ...ANSWERS, level: "Minimal risk" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("postPublicTierExplanation", () => {
  it("is unavailable, without a model call, when the form has no AI", async () => {
    const res = createRes({ ...AI_FORM, liveChecksEnabled: false });
    await postPublicTierExplanation(req({ answers: ANSWERS }), res);
    expect(payload(res)).toEqual({ explanation: null, error: "unavailable" });
    expect(explainTier).not.toHaveBeenCalled();
    expect(consumeFormBudget).not.toHaveBeenCalled();
  });

  it("answers 429 when the form's hourly budget is spent", async () => {
    m(getLLMKeyWithKeyByIdQuery).mockResolvedValue({ id: 3 });
    m(consumeFormBudget).mockResolvedValue(false);
    const res = createRes();
    await postPublicTierExplanation(req({ answers: ANSWERS }), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith("RateLimit-Reset", expect.any(String));
    expect(explainTier).not.toHaveBeenCalled();
  });

  it("returns the explanation points, or unavailable when they were not grounded", async () => {
    m(getLLMKeyWithKeyByIdQuery).mockResolvedValue({ id: 3 });
    m(consumeFormBudget).mockResolvedValue(true);
    const points = [{ text: "You said it chats with people.", article: "Article 50(1)" }];
    m(explainTier).mockResolvedValueOnce({ ok: true, points });
    const ok = createRes();
    await postPublicTierExplanation(req({ answers: ANSWERS, language: "en" }), ok);
    expect(payload(ok)).toEqual({ explanation: points });

    m(explainTier).mockResolvedValueOnce({ ok: false, error: "not grounded" });
    const refused = createRes();
    await postPublicTierExplanation(req({ answers: ANSWERS }), refused);
    expect(payload(refused)).toEqual({ explanation: null, error: "unavailable" });
  });
});

describe("takeTierSuggestionResponse", () => {
  const run = (body: any) => {
    const res = createRes();
    const next = jest.fn();
    takeTierSuggestionResponse(req(body), res, next);
    return { res, next, body };
  };

  it("passes a submission without a response straight through", () => {
    const { res, next } = run({ email: "a@b.c" });
    expect(next).toHaveBeenCalled();
    expect(res.locals.tierSuggestionResponse).toBeUndefined();
  });

  it("moves a valid response off the body into res.locals, trimming the context", () => {
    const { res, next, body } = run({
      email: "a@b.c",
      tierSuggestionResponse: { accepted: false, context: "  We only rank internal staff.  " },
    });
    expect(next).toHaveBeenCalled();
    expect(body.tierSuggestionResponse).toBeUndefined();
    expect(res.locals.tierSuggestionResponse).toEqual({
      accepted: false,
      context: "We only rank internal staff.",
    });
  });

  it.each([
    { accepted: "yes" },
    { accepted: true, context: 5 },
    { accepted: true, context: "x".repeat(MAX_TIER_CONTEXT_CHARS + 1) },
    "accepted",
  ])("refuses %p", (response) => {
    const { res, next } = run({ tierSuggestionResponse: response });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("getSubmissionTierSuggestionResponse", () => {
  it("scopes the read to the caller's organization", async () => {
    m(getTierSuggestionResponseQuery).mockResolvedValue(null);
    const res = createRes();
    await getSubmissionTierSuggestionResponse(
      req(undefined, { params: { id: "12" }, organizationId: 4 }),
      res,
    );
    expect(getTierSuggestionResponseQuery).toHaveBeenCalledWith(12, 4);
    expect(payload(res)).toEqual({ response: null });
  });

  it("answers 404 for a submission of another organization", async () => {
    m(getTierSuggestionResponseQuery).mockResolvedValue(undefined);
    const res = createRes();
    await getSubmissionTierSuggestionResponse(
      req(undefined, { params: { id: "12" }, organizationId: 4 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
