import { CORPUS_CSV_HEADER, corpusCsvHeaderLine, corpusCsvRow } from "./corpusCsv";

describe("corpus CSV", () => {
  it("has exactly candidate_id, artifact_kind and artifact, and no demographic or tier column", () => {
    expect([...CORPUS_CSV_HEADER]).toEqual(["candidate_id", "artifact_kind", "artifact"]);
    expect(corpusCsvHeaderLine()).toBe("candidate_id,artifact_kind,artifact\r\n");
  });

  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    expect(corpusCsvRow({ candidateId: "C0001", artifactKind: "resume", text: 'a, "b"\nc' })).toBe(
      'C0001,resume,"a, ""b""\nc"\r\n',
    );
  });

  it("neutralises a leading formula character", () => {
    expect(corpusCsvRow({ candidateId: "C0002", artifactKind: "resume", text: "=SUM(A1)" })).toBe(
      "C0002,resume,'=SUM(A1)\r\n",
    );
    for (const lead of ["+", "-", "@", "\t", "\r"]) {
      expect(
        corpusCsvRow({ candidateId: "C0003", artifactKind: "resume", text: `${lead}x` }),
      ).toMatch(/^C0003,resume,"?'/);
    }
  });
});
