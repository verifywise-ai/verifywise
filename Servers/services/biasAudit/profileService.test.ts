const utils = {
  getCurrentProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
  createProfileVersionQuery: jest.fn(),
  upsertAnswerQuery: jest.fn(),
  attestProfileQuery: jest.fn(),
  getProjectQuery: jest.fn(),
  getAttestedProfileQuery: jest.fn(),
  userCanAccessProjectQuery: jest.fn(),
  listProfileStancesQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
const mockTx = { id: "tx" };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: (fn: (t: object) => unknown) => fn(mockTx) },
}));

import { attestProfile, getQuestionSet, getProfileView, saveAnswers } from "./profileService";
import { LL144_QUESTIONS } from "../../structures/NYC-Local-Law-144/intake.questions";

const base = { projectId: 7, frameworkId: 15, userId: 9, organizationId: 42, role: "Admin" };
const row = (k: string, v: string | null, extra: Record<string, unknown> = {}) => ({
  question_key: k,
  answer_value: v,
  answer_notes: v ? "x" : null,
  is_dont_know: v === null,
  is_not_applicable: false,
  ...extra,
});

beforeEach(() => {
  Object.values(utils).forEach((f) => f.mockReset());
  // The query returns an array, never undefined; tests that list some override it.
  utils.listProfileStancesQuery.mockResolvedValue([]);
});

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

describe("saveAnswers authorship and races", () => {
  it("keeps the original author and time on carried-forward answers", async () => {
    const when = new Date("2026-01-02T03:04:05Z");
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 2, status: "attested" });
    utils.getProfileAnswersQuery.mockResolvedValue([
      row("role.party", "vendor", { answered_by_user_id: 3, answered_at: when }),
      row("scope.weighting", "biggest", { answered_by_user_id: 4, answered_at: when }),
    ]);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 6, version: 3 });
    await saveAnswers({
      ...base,
      answers: [
        { questionKey: "role.party", value: "employer", notes: "Changed.", dontKnow: false },
      ],
    });
    const written = Object.fromEntries(
      utils.upsertAnswerQuery.mock.calls.map((c) => [c[0].questionKey, c[0]]),
    );
    expect(written["role.party"].answeredByUserId).toBe(9);
    expect(written["role.party"].answeredAt).toBeNull();
    expect(written["scope.weighting"].answeredByUserId).toBe(4);
    expect(written["scope.weighting"].answeredAt).toBe(when);
  });

  it("turns a version-number race into a conflict", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 2, status: "attested" });
    utils.getProfileAnswersQuery.mockResolvedValue([]);
    utils.createProfileVersionQuery.mockRejectedValue(
      Object.assign(new Error("duplicate key"), {
        name: "SequelizeUniqueConstraintError",
        original: { code: "23505" },
      }),
    );
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "role.party", value: "vendor", notes: "x", dontKnow: false }],
      }),
    ).rejects.toThrow(/reload and retry/i);
    expect(utils.upsertAnswerQuery).not.toHaveBeenCalled();
  });

  // A save racing an attestation, or another save, must read the profile it
  // writes to under a row lock, so it sees the attestation or the other
  // save's answers instead of writing over them.
  it("locks the current profile and reads its answers inside the transaction", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue([]);
    await saveAnswers({
      ...base,
      answers: [{ questionKey: "role.party", value: "vendor", notes: "x", dontKnow: false }],
    });
    expect(utils.getCurrentProfileQuery).toHaveBeenCalledWith(7, 15, 42, { transaction: mockTx });
    expect(utils.getProfileAnswersQuery).toHaveBeenCalledWith(5, 42, mockTx);
    expect(utils.upsertAnswerQuery.mock.calls[0][2]).toBe(mockTx);
  });

  it("passes on the conflict the answer write raises for a profile that is no longer a draft", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue([]);
    const { ConflictException } = jest.requireActual(
      "../../domain.layer/exceptions/custom.exception",
    );
    utils.upsertAnswerQuery.mockRejectedValue(
      new ConflictException("Profile 5 is attested", "AedtProfile", "status"),
    );
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "role.party", value: "vendor", notes: "x", dontKnow: false }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("does not swallow other errors from the version create", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.createProfileVersionQuery.mockRejectedValue(new Error("boom"));
    await expect(
      saveAnswers({
        ...base,
        answers: [{ questionKey: "role.party", value: "vendor", notes: "x", dontKnow: false }],
      }),
    ).rejects.toThrow("boom");
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
    utils.attestProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "attested" });
    await expect(attestProfile(base)).rejects.toThrow(/scope\.weighting|unanswered/i);
  });

  it("refuses to attest when a veto is answered don't know", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue(
      ["role.party", "scope.weighting", "independence.auditor", "data.held"].map((k) =>
        row(k, null),
      ),
    );
    utils.attestProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "attested" });
    await expect(attestProfile(base)).rejects.toThrow(/don't know|unanswered/i);
  });

  it("checks the vetoes after the row is locked, on a read inside the transaction", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "draft" });
    utils.getProfileAnswersQuery.mockResolvedValue(allFour);
    utils.attestProfileQuery.mockResolvedValue({ id: 5, version: 1, status: "attested" });
    await attestProfile(base);
    expect(utils.attestProfileQuery.mock.invocationCallOrder[0]).toBeLessThan(
      utils.getProfileAnswersQuery.mock.invocationCallOrder[0],
    );
    // The answers are read with the transaction handle, not outside it.
    expect(utils.getProfileAnswersQuery.mock.calls[0][2]).toBeDefined();
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

describe("getQuestionSet", () => {
  const scope = { projectId: 7, frameworkId: 12, organizationId: 42, userId: 9, role: "Admin" };

  it("refuses a project outside the organization with a not-found", async () => {
    utils.getProjectQuery.mockResolvedValue(null);
    await expect(getQuestionSet(scope)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.getProjectQuery).toHaveBeenCalledWith(7, 42);
  });

  // The wizard filters on the answers on screen, so a follow-up that an
  // unsaved answer makes applicable must already be in the set it holds.
  it("returns every question, follow-ups included, each with its predicate", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    const out = await getQuestionSet(scope);
    expect(out.questions.map((q) => q.key)).toEqual(LL144_QUESTIONS.map((q) => q.key));
    const planned = out.questions.find((q) => q.key === "cutoff.planned");
    expect(planned?.appliesWhen).toBeDefined();
  });

  it("reads no answers, since the set does not depend on them", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    await getQuestionSet(scope);
    expect(utils.getCurrentProfileQuery).not.toHaveBeenCalled();
    expect(utils.getProfileAnswersQuery).not.toHaveBeenCalled();
  });
});

describe("getProfileView", () => {
  const scope = { projectId: 7, frameworkId: 12, organizationId: 42, userId: 9, role: "Admin" };

  it("refuses a project outside the organization with a not-found", async () => {
    utils.getProjectQuery.mockResolvedValue(null);
    await expect(getProfileView(scope)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns no profile, no answers and no readiness figure before anything is saved", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    const out = await getProfileView(scope);
    expect(out.profile).toBeNull();
    expect(out.attested).toBeNull();
    expect(out.answers).toEqual([]);
    expect(out.readiness.score).toBeNull();
  });

  it("shows a draft over an attested version, and names the attested one separately", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 4, version: 2, status: "draft" });
    utils.getAttestedProfileQuery.mockResolvedValue({
      id: 3,
      version: 1,
      status: "attested",
      attested_by_user_id: 9,
      attested_at: "2026-10-01",
    });
    utils.getProfileAnswersQuery.mockResolvedValue([
      row("role.party", "vendor", { answer_notes: "We supply it.", answered_by_user_id: 9 }),
    ]);
    const out = await getProfileView(scope);
    expect(out.profile).toMatchObject({ id: 4, version: 2, status: "draft" });
    expect(out.attested).toMatchObject({ id: 3, version: 1, attestedByUserId: 9 });
    expect(out.answers[0]).toMatchObject({
      questionKey: "role.party",
      value: "vendor",
      notes: "We supply it.",
      dontKnow: false,
      answeredByUserId: 9,
    });
    expect(utils.getProfileAnswersQuery).toHaveBeenCalledWith(4, 42);
  });

  it("reports no attested decision before any profile is attested", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 4, version: 1, status: "draft" });
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    utils.getProfileAnswersQuery.mockResolvedValue([row("role.party", "vendor")]);
    const out = await getProfileView(scope);
    expect(out.attestedDecision).toBeNull();
  });

  // Runs and scope determinations act on the attested answers, so the view
  // reports their decision apart from the draft's readiness.
  it("decides from the attested answers while a draft says otherwise", async () => {
    const vetoes = [
      row("role.party", "vendor"),
      row("independence.auditor", "self"),
      row("data.held", "none"),
    ];
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 4, version: 2, status: "draft" });
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 3, version: 1, status: "attested" });
    utils.getProfileAnswersQuery.mockImplementation(async (profileId: number) =>
      profileId === 3
        ? [...vetoes, row("scope.weighting", "biggest"), row("cutoff.applied_by", "person")]
        : [...vetoes, row("scope.weighting", "one_of_several")],
    );
    const out = await getProfileView(scope);
    expect(out.readiness.scope).toBe("out_of_scope");
    expect(out.attestedDecision).toMatchObject({
      readiness: { scope: "in_scope" },
      metric: "scoring_rate",
    });
    expect(utils.getProfileAnswersQuery).toHaveBeenCalledWith(3, 42);
  });

  it("reads the answers once when the edited version is the attested one", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue({ id: 3, version: 1, status: "attested" });
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 3, version: 1, status: "attested" });
    utils.getProfileAnswersQuery.mockResolvedValue([
      row("role.party", "vendor"),
      row("scope.weighting", "one_of_several"),
      row("independence.auditor", "self"),
      row("data.held", "none"),
    ]);
    const out = await getProfileView(scope);
    expect(out.attestedDecision).toMatchObject({
      readiness: { scope: "out_of_scope" },
      metric: null,
    });
    expect(utils.getProfileAnswersQuery).toHaveBeenCalledTimes(1);
  });

  it("lists the project's scope determinations, which no run's stance list carries", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    const stance = {
      id: 30,
      profile_id: 3,
      version: 2,
      pdf_sha256: "c".repeat(64),
      scope_at_generation: "out_of_scope",
      score_at_generation: null,
      profile_version: 1,
      question_set_version: 1,
      generated_by: 9,
      generated_at: "2026-10-17T10:00:00Z",
    };
    utils.listProfileStancesQuery.mockResolvedValue([stance]);
    const out = await getProfileView(scope);
    expect(utils.listProfileStancesQuery).toHaveBeenCalledWith(7, 12, 42);
    // No attested profile now, so none of them cites the current one.
    expect(out.scopeDeterminations).toEqual([{ ...stance, isCurrent: false }]);
  });

  it("marks only the scope determinations of the currently attested profile as current", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 3, version: 2, status: "attested" });
    utils.getProfileAnswersQuery.mockResolvedValue([]);
    utils.listProfileStancesQuery.mockResolvedValue([
      { id: 31, profile_id: 3, version: 2 },
      { id: 30, profile_id: 2, version: 1 },
    ]);
    const out = await getProfileView(scope);
    expect(out.scopeDeterminations.map((s) => [s.id, s.isCurrent])).toEqual([
      [31, true],
      [30, false],
    ]);
  });

  it("reads the attested profile and the scope determinations concurrently", async () => {
    const order: string[] = [];
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.getAttestedProfileQuery.mockImplementation(async () => {
      order.push("attested:start");
      await new Promise((r) => setImmediate(r));
      order.push("attested:end");
      return null;
    });
    utils.listProfileStancesQuery.mockImplementation(async () => {
      order.push("stances:start");
      return [];
    });
    await getProfileView(scope);
    expect(order.indexOf("stances:start")).toBeLessThan(order.indexOf("attested:end"));
  });

  it("reads no scope determinations for a viewer the member rule refuses", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(false);
    await expect(getProfileView({ ...scope, role: "Editor" })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(utils.listProfileStancesQuery).not.toHaveBeenCalled();
  });
});

describe("project-member access", () => {
  const outsider = { ...base, role: "Editor" };
  const viewScope = {
    projectId: 7,
    frameworkId: 12,
    organizationId: 42,
    userId: 9,
    role: "Editor",
  };
  const answers = [
    { questionKey: "role.party", value: "vendor", notes: "We supply it.", dontKnow: false },
  ];

  it.each(["Editor", "Reviewer", "Auditor", "SuperAdmin"])(
    "answers 404 to a %s who is not on the project, touching nothing, on save, attest and view",
    async (role) => {
      utils.userCanAccessProjectQuery.mockResolvedValue(false);
      const who = { ...outsider, role };
      await expect(saveAnswers({ ...who, answers })).rejects.toMatchObject({ statusCode: 404 });
      await expect(attestProfile(who)).rejects.toMatchObject({ statusCode: 404 });
      await expect(getProfileView({ ...viewScope, role })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(utils.createProfileVersionQuery).not.toHaveBeenCalled();
      expect(utils.upsertAnswerQuery).not.toHaveBeenCalled();
      expect(utils.attestProfileQuery).not.toHaveBeenCalled();
      expect(utils.getCurrentProfileQuery).not.toHaveBeenCalled();
    },
  );

  it("checks access before it validates, so an outsider learns nothing from a 400", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(false);
    await expect(
      saveAnswers({
        ...outsider,
        answers: [{ questionKey: "nope", value: "x", notes: null, dontKnow: false }],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets a project member save, attest and view", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(true);
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 1, version: 1 });
    await expect(saveAnswers({ ...outsider, answers })).resolves.toEqual({
      profileId: 1,
      version: 1,
    });
    await expect(attestProfile(outsider)).rejects.toThrow(/no profile/i);
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(getProfileView(viewScope)).resolves.toMatchObject({ project: { id: 7 } });
    expect(utils.userCanAccessProjectQuery).toHaveBeenCalledWith(7, 9, 42);
  });

  it("lets an organization Admin through without a membership lookup", async () => {
    utils.getCurrentProfileQuery.mockResolvedValue(null);
    utils.createProfileVersionQuery.mockResolvedValue({ id: 1, version: 1 });
    await saveAnswers({ ...base, answers });
    expect(utils.userCanAccessProjectQuery).not.toHaveBeenCalled();
  });

  it("answers 404 on the question set to a non-member, as on every project-scoped read", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(false);
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    await expect(getQuestionSet(viewScope)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.getProjectQuery).not.toHaveBeenCalled();
  });

  it("gives a member the question set", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(true);
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    await expect(getQuestionSet(viewScope)).resolves.toHaveProperty("questions");
    expect(utils.userCanAccessProjectQuery).toHaveBeenCalledWith(7, 9, 42);
  });
});
