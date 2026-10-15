const utils = {
  getCurrentProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
  createProfileVersionQuery: jest.fn(),
  upsertAnswerQuery: jest.fn(),
  attestProfileQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
jest.mock("../../database/db", () => ({
  sequelize: { transaction: (fn: (t: object) => unknown) => fn({}) },
}));

import { attestProfile, saveAnswers } from "./profileService";

const base = { projectId: 7, frameworkId: 15, userId: 9, organizationId: 42 };
const row = (k: string, v: string | null, extra: Record<string, unknown> = {}) => ({
  question_key: k,
  answer_value: v,
  answer_notes: v ? "x" : null,
  is_dont_know: v === null,
  is_not_applicable: false,
  ...extra,
});

beforeEach(() => Object.values(utils).forEach((f) => f.mockReset()));

describe("saveAnswers", () => {
  it("creates version 1 when no profile exists", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 1, version: 1 });
    const out = await saveAnswers({
      ...base,
      answers: [
        { questionKey: "role.party", value: "vendor", notes: "We supply it.", dontKnow: false },
      ],
    });
    expect(out).toEqual({ profileId: 1, version: 1 });
    expect(utils.createProfileVersionQuery.mock.calls[0][0].version).toBe(1);
    expect(utils.upsertAnswerQuery.mock.calls[0][0].profileId).toBe(1);
  });

  // Review Focus 1
  it("creates a new version rather than editing an attested one", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 2, status: "attested" });
    utils.getProfileAnswersQuery.mockResolvedValue([
      row("role.party", "vendor"),
      row("scope.weighting", "biggest"),
    ]);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 6, version: 3 });

    const out = await saveAnswers({
      ...base,
      answers: [
        { questionKey: "role.party", value: "employer", notes: "Changed.", dontKnow: false },
      ],
    });

    expect(out).toEqual({ profileId: 6, version: 3 });
    const written = Object.fromEntries(
      utils.upsertAnswerQuery.mock.calls.map((c) => [c[0].questionKey, c[0]]),
    );
    // The edit lands on the new profile, and the untouched answer is carried forward.
    expect(written["role.party"].answerValue).toBe("employer");
    expect(written["scope.weighting"].answerValue).toBe("biggest");
    expect(utils.upsertAnswerQuery.mock.calls.every((c) => c[0].profileId === 6)).toBe(true);
    expect(utils.attestProfileQuery).not.toHaveBeenCalled();
  });

  it("edits a draft in place", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue([]);
    const out = await saveAnswers({
      ...base,
      answers: [{ questionKey: "role.party", value: "vendor", notes: "x", dontKnow: false }],
    });
    expect(out).toEqual({ profileId: 5, version: 1 });
    expect(utils.createProfileVersionQuery).not.toHaveBeenCalled();
  });

  it("rejects an unknown question key", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "not.a.question", value: "x", notes: null, dontKnow: false }],
      }),
    ).rejects.toThrow(/unknown question/i);
    expect(utils.upsertAnswerQuery).not.toHaveBeenCalled();
  });

  it("rejects a value not among the question's options", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "role.party", value: "nonsense", notes: "x", dontKnow: false }],
      }),
    ).rejects.toThrow(/not a valid option/i);
  });

  it("requires notes on a veto answer", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "role.party", value: "vendor", notes: "  ", dontKnow: false }],
      }),
    ).rejects.toThrow(/own words|notes are required/i);
  });

  it("allows a don't-know with no value and no notes", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 1, version: 1 });
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "data.held", value: null, notes: null, dontKnow: true }],
      }),
    ).resolves.toBeDefined();
    const call = utils.upsertAnswerQuery.mock.calls[0][0];
    expect(call.isDontKnow).toBe(true);
    expect(call.answerValue).toBeNull();
  });

  it("rejects a don't-know on a question that does not allow it", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    await expect(
      saveAnswers({
        ...base,
        answers: [
          { questionKey: "independence.auditor", value: null, notes: null, dontKnow: true },
        ],
      }),
    ).rejects.toThrow(/does not allow/i);
  });

  it("rejects a non-don't-know answer with no value", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "cutoff.applied_by", value: null, notes: null, dontKnow: false }],
      }),
    ).rejects.toThrow(/not a valid option/i);
  });

  it("stores is_not_applicable from applicability, and refreshes carried answers", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    // cutoff.applied_by was applicable while scope.weighting was "biggest".
    utils.getProfileAnswersQuery.mockResolvedValue([
      row("scope.weighting", "biggest"),
      row("cutoff.applied_by", "person"),
    ]);
    await saveAnswers({
      ...base,
      answers: [
        {
          questionKey: "scope.weighting",
          value: "one_of_several",
          notes: "Minor input.",
          dontKnow: false,
        },
      ],
    });
    const written = Object.fromEntries(
      utils.upsertAnswerQuery.mock.calls.map((c) => [c[0].questionKey, c[0]]),
    );
    expect(written["scope.weighting"].isNotApplicable).toBe(false);
    expect(written["cutoff.applied_by"].isNotApplicable).toBe(true);
    // The answer is kept, only flagged, so it comes back if scope changes again.
    expect(written["cutoff.applied_by"].answerValue).toBe("person");
  });
});

describe("attestProfile", () => {
  const allFour = [
    row("role.party", "vendor"),
    row("scope.weighting", "biggest"),
    row("independence.auditor", "self"),
    row("data.held", "none"),
  ];

  it("refuses to attest with a veto unanswered", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue([row("role.party", "vendor")]);
    await expect(attestProfile(base)).rejects.toThrow(/scope\.weighting|unanswered/i);
    expect(utils.attestProfileQuery).not.toHaveBeenCalled();
  });

  it("refuses to attest when a veto is answered don't know", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue(
      ["role.party", "scope.weighting", "independence.auditor", "data.held"].map((k) =>
        row(k, null),
      ),
    );
    await expect(attestProfile(base)).rejects.toThrow(/don't know|unanswered/i);
  });

  it("attests when all four vetoes carry a value", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue(allFour);
    utils.attestProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "attested" });
    const out = await attestProfile(base);
    expect(out).toEqual({ profileId: 5, version: 1 });
    expect(utils.attestProfileQuery.mock.calls[0].slice(0, 3)).toEqual([5, 9, 42]);
  });

  it("refuses when there is no profile to attest", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    await expect(attestProfile(base)).rejects.toThrow(/no profile/i);
  });
});
