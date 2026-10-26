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
      "Mexican-born, with a US work permit",
      "A native Spanish speaker",
      "Of Korean descent",
      "Volunteer at my church food bank",
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

  it("finds the first name and surname as whole words, in any order (ruling)", () => {
    const lan = { candidateName: "Lan Tran" };
    const body = "\nExperience\nWarehouse associate, 2019-2024\nSkills\nForklift";
    expect(validateRecord(`Tran, Lan${body}`, "resume", lan)).toEqual({ ok: true });
    expect(validateRecord(`Lan T. Tran${body}`, "resume", lan)).toEqual({ ok: true });
    expect(validateRecord(`Lan Tranh${body}`, "resume", lan)).toEqual({
      ok: false,
      reason: "no_name",
    });
    expect(validateRecord(`Tran${body}`, "resume", lan)).toEqual({ ok: false, reason: "no_name" });
  });

  // The review's probes (round 3).
  const body = (head: string, extra: string) =>
    `${head}\nExperience\nWarehouse associate, 2019-2024\n${extra}\nSkills\nForklift`;

  it("matches the name case-sensitively, so common words are not the name", () => {
    expect(
      validateRecord(body("Kevin", "Worked as a line cook"), "resume", {
        candidateName: "Kevin Cook",
      }),
    ).toEqual({ ok: false, reason: "no_name" });
    expect(
      validateRecord(body("Shift lead", "Worked long shifts; le"), "resume", {
        candidateName: "Long Le",
      }),
    ).toEqual({ ok: false, reason: "no_name" });
    expect(
      validateRecord(body("KEVIN COOK", "Worked as a line cook"), "resume", {
        candidateName: "Kevin Cook",
      }),
    ).toEqual({ ok: true });
  });

  it("ignores accents on both sides of the name check (ruling)", () => {
    expect(
      validateRecord(body("José García", ""), "resume", { candidateName: "Jose Garcia" }),
    ).toEqual({ ok: true });
    expect(
      validateRecord(body("Jose Garcia", ""), "resume", { candidateName: "José García" }),
    ).toEqual({ ok: true });
  });

  it.each([
    "Warehouse in Gary, IN",
    "Managed the Kimberly-Clark account",
    "Delivery driver, Papa John's",
    "Graduated from Roosevelt High School",
    "Reported to Patricia, the regional lead",
  ])("does not read a lone first name as a person: %s", (extra) => {
    expect(
      validateRecord(body("Kevin Miller", extra), "resume", { candidateName: "Kevin Miller" }),
    ).toEqual({ ok: true });
  });

  it("refuses a record that names someone else: a table first name and surname (ruling)", () => {
    const kevin = { candidateName: "Kevin Miller" };
    expect(validateRecord(body("Kevin Miller", "References: Wei Zhang"), "resume", kevin)).toEqual({
      ok: false,
      reason: "third_party_name",
    });
    expect(
      validateRecord(body("Kevin Miller", "Reported to Patricia Nguyen"), "resume", kevin),
    ).toEqual({ ok: false, reason: "third_party_name" });
    expect(
      validateRecord(
        "Interviewer: Hello, Sam Lee.\nCandidate: Hi. My lead, José Garcia, trained me.",
        "transcript",
        NAME,
      ),
    ).toEqual({ ok: false, reason: "third_party_name" });
  });

  // The review's probes (round 4).
  it.each([
    ["Keoni Kaawa", "Keoni Ka'awa"],
    ["Keoni Kaawa", "Keoni Kaʻawa"],
    ["Sina Mataafa", "Sina Mataʻafa"],
    ["Malia Faamausili", "Malia Fa'amausili"],
    ["Thuy Le", "Thúy Lê"],
    ["Thuy Le", "THUY LE"],
    ["Ana Jeanbaptiste", "Ana Jean-Baptiste"],
  ])(
    "finds %s written as %s (accents, ʻokina, apostrophes, hyphens folded)",
    (candidateName, head) => {
      expect(validateRecord(body(head, ""), "resume", { candidateName })).toEqual({ ok: true });
    },
  );

  it.each([
    "B.A., University of Mary Washington",
    "A.A.S., Thomas Nelson Community College",
    "A.A., John Wood Community College",
    "A.A., Thomas Nelson community college",
    "Volunteer, Mary Washington library",
    "Volunteer, Martin Luther King Jr. Library",
    "Coach, Thomas Nelson Park",
    "Shift lead, Mary Washington Hospital",
    "Covered accounts in San Jose and St. Paul",
  ])("does not read an institution or place named after a person as a person: %s", (extra) => {
    expect(
      validateRecord(body("Kevin Miller", extra), "resume", { candidateName: "Kevin Miller" }),
    ).toEqual({ ok: true });
  });

  it("reads a person in capitals as a person", () => {
    expect(
      validateRecord(body("Kevin Miller", "Reported to PATRICIA NGUYEN"), "resume", {
        candidateName: "Kevin Miller",
      }),
    ).toEqual({ ok: false, reason: "third_party_name" });
  });

  it("checks a structured record's parsed values, not its raw JSON", () => {
    const kevin = { candidateName: "Kevin Miller" };
    expect(
      validateRecord(
        '{"name":"Kevin Miller","summary":"Trained by Jos\\u00e9 Garcia","experience":[],"skills":[]}',
        "structured",
        kevin,
      ),
    ).toEqual({ ok: false, reason: "third_party_name" });
    expect(
      validateRecord(
        '{"name":"Kevin Miller","summary":"x","experience":[],"skills":[],"languages":["English","Italian"]}',
        "structured",
        kevin,
      ),
    ).toEqual({ ok: false, reason: "demographic_term" });
    expect(
      validateRecord(
        '{"name":"Kevin Miller","summary":"Of Korean descent","experience":[],"skills":[]}',
        "structured",
        kevin,
      ),
    ).toEqual({ ok: false, reason: "demographic_term" });
  });

  // The review's probes (round 5).
  it.each([
    ["Keoni Kaawa", "Keoni Kaʼawa"],
    ["Keoni Kaawa", "Keoni Ka`awa"],
    ["Keoni Kaawa", "Keoni Ka´awa"],
  ])(
    "finds %s written as %s (modifier apostrophe, backtick, acute folded)",
    (candidateName, head) => {
      expect(validateRecord(body(head, ""), "resume", { candidateName })).toEqual({ ok: true });
    },
  );

  it.each([
    "Crew member, Jimmy John's",
    "Graduated John Marshall High School",
    "Crew member at Mary Washington Memorial Hospital",
    "Volunteer, John Wood Medical Center",
  ])("does not read an institution or brand as a person: %s", (extra) => {
    expect(
      validateRecord(body("Kevin Miller", extra), "resume", { candidateName: "Kevin Miller" }),
    ).toEqual({ ok: true });
  });

  it("never joins two structured items into one name", () => {
    // "... Grace" ending one item and "Cook, ..." starting the next is not a person.
    const s = JSON.stringify({
      name: "Kevin Miller",
      summary: "Line cook known for grace under pressure, led by Grace",
      experience: ["Cook, 120-seat diner, 2019-2024"],
      skills: ["Knife work"],
    });
    expect(validateRecord(s, "structured", { candidateName: "Kevin Miller" })).toEqual({
      ok: true,
    });
  });

  it.each([
    "Ethnicity: Asian",
    "- Religion: Catholic",
    "Nationality: Filipino",
    "National origin: Mexico",
    "Citizenship: Canada",
    "**Heritage:** Samoan",
  ])("refuses a line labelled with a protected characteristic: %s", (line) => {
    expect(validateRecord(`${resume}\n${line}`, "resume", NAME)).toEqual({
      ok: false,
      reason: "demographic_field",
    });
  });

  it("reads an extra structured key as a field label", () => {
    const s = JSON.stringify({
      name: "Kevin Miller",
      summary: "x",
      experience: ["Warehouse associate"],
      skills: ["Forklift"],
      ethnicity: "not stated",
    });
    expect(validateRecord(s, "structured", { candidateName: "Kevin Miller" })).toEqual({
      ok: false,
      reason: "demographic_field",
    });
  });

  it.each([
    ["Buffing and polish"],
    ["French cuisine"],
    ["Swedish massage"],
    ["Thai curries"],
    ["English (native)"],
  ])("passes a structured skill that only borrows a language name: %s", (skill) => {
    const s = JSON.stringify({
      name: "Kevin Miller",
      summary: "x",
      experience: ["Associate"],
      skills: [skill, "Negotiation"],
    });
    expect(validateRecord(s, "structured", { candidateName: "Kevin Miller" })).toEqual({
      ok: true,
    });
  });

  it.each([
    ["Spanish (fluent)"],
    ["Mandarin Chinese"],
    ["Spanish - native"],
    ["Tagalog, conversational"],
    ["English/Spanish (bilingual)"],
    ["English (native), Tagalog (fluent)"],
  ])("refuses a structured skill that can only be a language: %s", (skill) => {
    const s = JSON.stringify({
      name: "Kevin Miller",
      summary: "x",
      experience: ["Associate"],
      skills: [skill, "Negotiation"],
    });
    expect(validateRecord(s, "structured", { candidateName: "Kevin Miller" })).toEqual({
      ok: false,
      reason: "demographic_term",
    });
  });

  it("passes an extra structured key that names no group", () => {
    const s = JSON.stringify({
      name: "Kevin Miller",
      summary: "x",
      experience: ["Warehouse associate"],
      skills: ["Forklift"],
      certifications: ["OSHA 10"],
    });
    expect(validateRecord(s, "structured", { candidateName: "Kevin Miller" })).toEqual({
      ok: true,
    });
  });

  it("scans structured keys beyond the four the form asks for", () => {
    const s = JSON.stringify({
      name: "Kevin Miller",
      summary: "x",
      experience: ["Warehouse associate"],
      skills: ["Forklift"],
      spanish: "fluent",
    });
    expect(validateRecord(s, "structured", { candidateName: "Kevin Miller" })).toEqual({
      ok: false,
      reason: "demographic_term",
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
    expect(p).toMatch(/Name no person other than the candidate/);
    // Ruling (round 4): steer settings away from group-named employers first.
    expect(p).toMatch(
      /Do not name an employer, school, restaurant or organisation whose name states a nationality, a cuisine, a religion or a cultural or ancestral group/,
    );
  });
});
