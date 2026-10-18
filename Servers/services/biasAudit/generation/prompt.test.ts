import { JOB_DESCRIPTIONS } from "../../../structures/NYC-Local-Law-144/job-descriptions";
import { LL144_RACE, LL144_SEX } from "./allocation";
import { nameFor } from "./names";
import { buildPrompt, RECORD_MAX_CHARS, validateRecord, type ArtifactKind } from "./prompt";
import { findForbidden } from "../stance/vocabulary";

const jd = JOB_DESCRIPTIONS["commercial-ae"];
const KINDS: ArtifactKind[] = ["resume", "transcript", "structured"];
// The words for every group, and generic demographic terms. Whole words.
const GROUP_WORDS =
  /\b(male|female|man|woman|men|women|gender|sex|race|racial|ethnic|ethnicity|hispanic|latino|latina|latinx|white|black|african|asian|native|hawaiian|pacific|islander|alaska|indian|multiracial|biracial)\b/i;

describe("buildPrompt", () => {
  it("carries the job description and the assigned tier's narrative", () => {
    const p = buildPrompt({
      jobDescription: jd,
      tierKey: "t3_borderline",
      artifactKind: "resume",
      candidateName: "Ana Ruiz",
    });
    expect(p).toContain(jd.body);
    expect(p).toContain(jd.tiers[2].narrative);
    expect(p).toContain("The candidate's name is Ana Ruiz.");
  });

  it("takes qualifications from the assigned tier only", () => {
    const p = buildPrompt({
      jobDescription: jd,
      tierKey: "t3_borderline",
      artifactKind: "resume",
      candidateName: "Ana Ruiz",
    });
    for (const t of jd.tiers.filter((x) => x.key !== "t3_borderline")) {
      expect(p).not.toContain(t.narrative);
    }
  });

  it("never states the assigned group, for any cell and any artifact form", () => {
    for (const key of ["commercial-ae", "operational-hourly"] as const) {
      for (const sex of LL144_SEX)
        for (const raceEthnicity of LL144_RACE) {
          for (const artifactKind of KINDS) {
            const p = buildPrompt({
              jobDescription: JOB_DESCRIPTIONS[key],
              tierKey: "t5_strongly_qualified", // gitleaks:allow (tier id, not a credential)
              artifactKind,
              candidateName: "Sam Lee",
            });
            expect(p).not.toMatch(GROUP_WORDS);
            expect(p).not.toContain(sex);
            expect(p).not.toContain(raceEthnicity);
          }
        }
    }
  });

  it("sends no pronouns for the v1 artifact forms", () => {
    for (const artifactKind of KINDS) {
      const p = buildPrompt({
        jobDescription: jd,
        tierKey: "t1_strongly_under",
        artifactKind,
        candidateName: "Sam Lee",
      });
      expect(p).not.toMatch(/pronoun/i);
      expect(p).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    }
  });

  it("uses no forbidden vocabulary in any prompt", () => {
    for (const key of ["commercial-ae", "operational-hourly"] as const) {
      for (const artifactKind of KINDS) {
        const p = buildPrompt({
          jobDescription: JOB_DESCRIPTIONS[key],
          tierKey: "t4_qualified",
          artifactKind,
          candidateName: nameFor({ sex: "Male", raceEthnicity: "Asian" }, "C0001", 1),
        });
        expect(findForbidden(p)).toEqual([]);
      }
    }
  });

  it("refuses an unknown tier", () => {
    expect(() =>
      buildPrompt({
        jobDescription: jd,
        tierKey: "t9",
        artifactKind: "resume",
        candidateName: "Sam Lee",
      }),
    ).toThrow(/tier/i);
  });
});

describe("validateRecord", () => {
  const resume = "Sam Lee\nExperience\nAccount Executive, 2019-2024\nSkills\nNegotiation";
  const transcript =
    "Interviewer: Tell me about a deal.\nCandidate: I ran it.\n" +
    "Interviewer: How long?\nCandidate: Six months.";
  const structured = JSON.stringify({ summary: "x", experience: ["y"], skills: ["z"] });

  it("accepts a well-formed record of each kind", () => {
    expect(validateRecord(resume, "resume")).toEqual({ ok: true });
    expect(validateRecord(transcript, "transcript")).toEqual({ ok: true });
    expect(validateRecord(structured, "structured")).toEqual({ ok: true });
  });

  it("refuses empty and over-long text", () => {
    expect(validateRecord("  ", "resume")).toEqual({ ok: false, reason: "empty" });
    expect(validateRecord("x\n".repeat(RECORD_MAX_CHARS), "resume")).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("refuses forbidden vocabulary, by the module's matcher", () => {
    const word = ["pas", "sed"].join(""); // kept out of this source file as one token
    expect(validateRecord(`${resume}\nI ${word} the exam`, "resume")).toEqual({
      ok: false,
      reason: "forbidden_words",
    });
  });

  it("refuses a demographic field in any form", () => {
    expect(validateRecord(`${resume}\nGender: F`, "resume")).toEqual({
      ok: false,
      reason: "demographic_field",
    });
    expect(validateRecord(`${transcript}\nCandidate: Date of birth: 1990`, "transcript")).toEqual({
      ok: false,
      reason: "demographic_field",
    });
    expect(validateRecord(`${resume}\nSexton Ltd: 2019`, "resume")).toEqual({ ok: true });
    expect(validateRecord(`Nationality: X\n${transcript}`, "transcript")).toEqual({
      ok: false,
      reason: "demographic_field",
    });
    expect(validateRecord(JSON.stringify({ summary: "x", ethnicity: "y" }), "structured")).toEqual({
      ok: false,
      reason: "demographic_field",
    });
    expect(
      validateRecord(
        JSON.stringify({ summary: "x", experience: [], skills: [], profile: { Age: 30 } }),
        "structured",
      ),
    ).toEqual({ ok: false, reason: "demographic_field" });
  });

  it("refuses a record whose shape does not match its form", () => {
    expect(validateRecord(resume, "transcript")).toEqual({ ok: false, reason: "wrong_shape" });
    expect(validateRecord("not json", "structured")).toEqual({ ok: false, reason: "wrong_shape" });
    expect(validateRecord(JSON.stringify({ summary: "x" }), "structured")).toEqual({
      ok: false,
      reason: "wrong_shape",
    });
    expect(validateRecord(JSON.stringify([1]), "structured")).toEqual({
      ok: false,
      reason: "wrong_shape",
    });
  });

  it("refuses a response the model did not finish (ruling: only 'stop' is clean)", () => {
    expect(validateRecord(resume, "resume", { finishReason: "length" })).toEqual({
      ok: false,
      reason: "unfinished",
    });
    expect(validateRecord(resume, "resume", { finishReason: null })).toEqual({
      ok: false,
      reason: "unfinished",
    });
    expect(validateRecord(resume, "resume", { finishReason: "stop" })).toEqual({ ok: true });
  });
});
