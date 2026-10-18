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
  const NAME = { candidateName: "Sam Lee" };
  const resume = "Sam Lee\nExperience\nAccount Executive, 2019-2024\nSkills\nNegotiation";
  const transcript =
    "Interviewer: Good morning, Sam Lee. Tell me about a deal.\nCandidate: I ran it.\n" +
    "Interviewer: How long?\nCandidate: Six months.";
  const structured = JSON.stringify({
    name: "Sam Lee",
    summary: "x",
    experience: ["y"],
    skills: ["z"],
  });

  it("accepts a well-formed record of each kind", () => {
    expect(validateRecord(resume, "resume", NAME)).toEqual({ ok: true });
    expect(validateRecord(transcript, "transcript", NAME)).toEqual({ ok: true });
    expect(validateRecord(structured, "structured", NAME)).toEqual({ ok: true });
  });

  it("refuses empty and over-long text", () => {
    expect(validateRecord("  ", "resume", NAME)).toEqual({ ok: false, reason: "empty" });
    expect(validateRecord("x\n".repeat(RECORD_MAX_CHARS), "resume", NAME)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("refuses forbidden vocabulary, by the module's matcher", () => {
    const word = ["pas", "sed"].join(""); // kept out of this source file as one token
    expect(validateRecord(`${resume}\nI ${word} the exam`, "resume", NAME)).toEqual({
      ok: false,
      reason: "forbidden_words",
    });
  });

  it("refuses a demographic field in any form", () => {
    expect(validateRecord(`${resume}\nGender: F`, "resume", NAME)).toEqual({
      ok: false,
      reason: "demographic_field",
    });
    expect(
      validateRecord(`${transcript}\nCandidate: Date of birth: 1990`, "transcript", NAME),
    ).toEqual({ ok: false, reason: "demographic_field" });
    expect(validateRecord(`${resume}\nSexton Ltd: 2019`, "resume", NAME)).toEqual({ ok: true });
    expect(validateRecord(`Nationality: X\n${transcript}`, "transcript", NAME)).toEqual({
      ok: false,
      reason: "demographic_field",
    });
    expect(
      validateRecord(
        JSON.stringify({ name: "Sam Lee", summary: "x", ethnicity: "y" }),
        "structured",
        NAME,
      ),
    ).toEqual({ ok: false, reason: "demographic_field" });
    expect(
      validateRecord(
        JSON.stringify({
          name: "Sam Lee",
          summary: "x",
          experience: [],
          skills: [],
          profile: { Age: 30 },
        }),
        "structured",
        NAME,
      ),
    ).toEqual({ ok: false, reason: "demographic_field" });
  });

  it("refuses any other group signal: affiliation, heritage language, nationality, religion", () => {
    for (const line of [
      "Member, Society of Hispanic Professional Engineers",
      "Fluent in Tongan",
      "Mexican citizen with a US work permit",
      "Volunteer at my church food bank",
      "Board member, Women in Sales network",
      "Treasurer, Alpha Kappa Alpha",
    ]) {
      expect(validateRecord(`${resume}\n${line}`, "resume", NAME)).toEqual({
        ok: false,
        reason: "demographic_term",
      });
    }
    const withLanguage = JSON.stringify({
      name: "Sam Lee",
      summary: "x",
      experience: ["y"],
      skills: ["Spanish"],
    });
    expect(validateRecord(withLanguage, "structured", NAME)).toEqual({
      ok: false,
      reason: "demographic_term",
    });
  });

  it("allows pronouns and honorifics consistent with the name", () => {
    expect(
      validateRecord(
        "Interviewer: Good morning, Ms. Sam Lee.\nCandidate: She asked me to lead it, so I did.\n" +
          "Interviewer: Thank you, Ms. Lee.\nCandidate: Thank you.",
        "transcript",
        NAME,
      ),
    ).toEqual({ ok: true });
  });

  it("refuses a record that does not carry the candidate's full name", () => {
    expect(validateRecord(resume.replace("Sam Lee", "Sam"), "resume", NAME)).toEqual({
      ok: false,
      reason: "no_name",
    });
    expect(validateRecord(transcript.replace("Sam Lee", "there"), "transcript", NAME)).toEqual({
      ok: false,
      reason: "no_name",
    });
    expect(
      validateRecord(structured.replace('"Sam Lee"', '"Candidate"'), "structured", NAME),
    ).toEqual({ ok: false, reason: "no_name" });
    // The name in a structured record's text but not its name key does not count.
    expect(
      validateRecord(
        JSON.stringify({ name: "S. L.", summary: "Sam Lee sells", experience: [], skills: [] }),
        "structured",
        NAME,
      ),
    ).toEqual({ ok: false, reason: "no_name" });
    // Case and spacing do not matter.
    expect(validateRecord(resume.replace("Sam Lee", "SAM   LEE"), "resume", NAME)).toEqual({
      ok: true,
    });
  });

  it("refuses a record whose shape does not match its form", () => {
    expect(validateRecord(resume, "transcript", NAME)).toEqual({
      ok: false,
      reason: "wrong_shape",
    });
    expect(validateRecord("not json", "structured", NAME)).toEqual({
      ok: false,
      reason: "wrong_shape",
    });
    expect(
      validateRecord(JSON.stringify({ name: "Sam Lee", summary: "x" }), "structured", NAME),
    ).toEqual({
      ok: false,
      reason: "wrong_shape",
    });
    expect(validateRecord(JSON.stringify([1]), "structured", NAME)).toEqual({
      ok: false,
      reason: "wrong_shape",
    });
  });

  it("refuses a response the model did not finish (ruling: only 'stop' is clean)", () => {
    expect(validateRecord(resume, "resume", { ...NAME, finishReason: "length" })).toEqual({
      ok: false,
      reason: "unfinished",
    });
    expect(validateRecord(resume, "resume", { ...NAME, finishReason: null })).toEqual({
      ok: false,
      reason: "unfinished",
    });
    expect(validateRecord(resume, "resume", { ...NAME, finishReason: "stop" })).toEqual({
      ok: true,
    });
  });
});

describe("the prompt asks for the name in the record", () => {
  it("names where the full name goes, for every form", () => {
    const p = (artifactKind: ArtifactKind) =>
      buildPrompt({
        jobDescription: jd,
        tierKey: "t4_qualified",
        artifactKind,
        candidateName: "Sam Lee",
      });
    expect(p("resume")).toMatch(/first line is the candidate's full name/);
    expect(p("transcript")).toMatch(/greets the candidate by full name/);
    expect(p("structured")).toMatch(/"name" \(the candidate's full name\)/);
  });

  it("forbids every other background signal", () => {
    const p = buildPrompt({
      jobDescription: jd,
      tierKey: "t4_qualified",
      artifactKind: "resume",
      candidateName: "Sam Lee",
    });
    expect(p).toMatch(/religion, heritage, languages other than English/);
    expect(p).toMatch(/identity-based organisations/);
  });
});
