/**
 * @fileoverview Tests for merging duplicate AI Detection findings.
 *
 * The catalogue lists some libraries twice ("qdrant" as a vector DB library,
 * "Qdrant" as a RAG component). Both match the same import, which used to
 * store two library findings for one library.
 */

import {
  findingMergeKey,
  mergeDuplicateFindings,
} from "../../../utils/aiDetectionFindingMerge.utils";
import { ICreateFindingInput } from "../../../domain.layer/interfaces/i.aiDetection";

function finding(overrides: Partial<ICreateFindingInput>): ICreateFindingInput {
  return {
    scan_id: 1,
    finding_type: "library",
    category: "Vector Databases",
    name: "qdrant",
    provider: "Qdrant",
    confidence: "high",
    risk_level: "medium",
    description: "Vector similarity search engine",
    file_count: 1,
    file_paths: [{ path: "app/db.py", line_number: 1, matched_text: "import qdrant_client" }],
    ...overrides,
  };
}

describe("mergeDuplicateFindings", () => {
  it("merges findings that differ only by name case into one", () => {
    const lower = finding({
      file_paths: [
        { path: "app/db.py", line_number: 1, matched_text: "import qdrant_client" },
        { path: "requirements.txt", line_number: null, matched_text: "qdrant-client==1.9" },
      ],
      file_count: 2,
    });
    const proper = finding({
      name: "Qdrant",
      category: "RAG Components",
      description: "Qdrant vector similarity search engine",
      file_paths: [
        { path: "app/db.py", line_number: 1, matched_text: "import qdrant_client" },
        { path: "app/search.py", line_number: 3, matched_text: "from qdrant_client import X" },
      ],
      file_count: 2,
    });

    const result = mergeDuplicateFindings([lower, proper]);

    expect(result).toHaveLength(1);
    // The curated, capitalised display name and its description win
    expect(result[0].name).toBe("Qdrant");
    expect(result[0].description).toBe("Qdrant vector similarity search engine");
    // File lists are unioned without duplicating the shared import line
    expect(result[0].file_paths?.map((f) => f.path)).toEqual([
      "app/db.py",
      "requirements.txt",
      "app/search.py",
    ]);
    expect(result[0].file_count).toBe(3);
  });

  it("keeps the display name when the capitalised variant comes first", () => {
    const result = mergeDuplicateFindings([
      finding({ name: "CrewAI", provider: "CrewAI", description: "CrewAI framework" }),
      finding({ name: "crewai", provider: "crewai", description: "Multi-agent framework" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("CrewAI");
    expect(result[0].provider).toBe("CrewAI");
    expect(result[0].description).toBe("CrewAI framework");
  });

  it("does not merge different libraries, providers or scans", () => {
    const result = mergeDuplicateFindings([
      finding({}),
      finding({ name: "faiss", provider: "Meta" }),
      finding({ provider: "Other" }),
      finding({ scan_id: 2 }),
    ]);
    expect(result).toHaveLength(4);
  });

  it("keeps the higher confidence and risk level", () => {
    const result = mergeDuplicateFindings([
      finding({ confidence: "medium", risk_level: "low" }),
      finding({ name: "Qdrant", confidence: "high", risk_level: "medium" }),
    ]);
    expect(result[0].confidence).toBe("high");
    expect(result[0].risk_level).toBe("medium");
  });

  it("keeps the higher severity so a critical variant is never downgraded", () => {
    const result = mergeDuplicateFindings([
      finding({ severity: "high" }),
      finding({ name: "Qdrant", severity: "critical" }),
    ]);
    expect(result[0].severity).toBe("critical");
  });

  it("treats a fresh detection as active when merged with a carried-forward one", () => {
    const result = mergeDuplicateFindings([
      finding({ finding_status: "carried_forward" }),
      finding({ name: "Qdrant" }),
    ]);
    expect(result[0].finding_status).toBeUndefined();
  });

  it("keeps a merged finding suppressed when every variant was suppressed", () => {
    // A rule on "qdrant" matches both case variants (name rules are
    // case-insensitive), so the stored "Qdrant" finding stays suppressed.
    const both = mergeDuplicateFindings([
      finding({ suppressed: true, suppression_rule_id: 4 }),
      finding({ name: "Qdrant", suppressed: true, suppression_rule_id: 4 }),
    ]);
    expect(both[0].name).toBe("Qdrant");
    expect(both[0].suppressed).toBe(true);
    expect(both[0].suppression_rule_id).toBe(4);

    const none = mergeDuplicateFindings([finding({}), finding({ name: "Qdrant" })]);
    expect(none[0].suppressed).toBeUndefined();
  });

  it("fails closed when only some variants of equal severity were suppressed", () => {
    for (const order of [
      [finding({ suppressed: true, suppression_rule_id: 4 }), finding({ name: "Qdrant" })],
      [finding({ name: "Qdrant" }), finding({ suppressed: true, suppression_rule_id: 4 })],
    ]) {
      const result = mergeDuplicateFindings(order);
      expect(result[0].suppressed).toBeFalsy();
      expect(result[0].suppression_rule_id ?? null).toBeNull();
    }
  });

  it("never lets a suppressed low-severity variant hide a critical one", () => {
    for (const order of [
      [
        finding({ severity: "low", suppressed: true, suppression_rule_id: 9 }),
        finding({ name: "Qdrant", severity: "critical" }),
      ],
      [
        finding({ name: "Qdrant", severity: "critical" }),
        finding({ severity: "low", suppressed: true, suppression_rule_id: 9 }),
      ],
    ]) {
      const result = mergeDuplicateFindings(order);
      expect(result[0].severity).toBe("critical");
      expect(result[0].suppressed).toBeFalsy();
      expect(result[0].suppression_rule_id ?? null).toBeNull();
    }
  });

  it("stays suppressed when the most severe variant was suppressed", () => {
    const result = mergeDuplicateFindings([
      finding({ severity: "low" }),
      finding({ name: "Qdrant", severity: "critical", suppressed: true, suppression_rule_id: 3 }),
    ]);
    expect(result[0].suppressed).toBe(true);
    expect(result[0].suppression_rule_id).toBe(3);
  });

  it("takes the finding type with the display name, so type and category agree", () => {
    const result = mergeDuplicateFindings([
      finding({ finding_type: "library", category: "Vector Databases" }),
      finding({ name: "Qdrant", finding_type: "rag_component", category: "RAG Components" }),
    ]);
    expect(result[0].finding_type).toBe("rag_component");
    expect(result[0].category).toBe("RAG Components");

    const displayFirst = mergeDuplicateFindings([
      finding({ name: "Qdrant", finding_type: "rag_component", category: "RAG Components" }),
      finding({ finding_type: "library", category: "Vector Databases" }),
    ]);
    expect(displayFirst[0].finding_type).toBe("rag_component");
    expect(displayFirst[0].category).toBe("RAG Components");
  });

  it("takes vulnerability details from the variant with the highest severity", () => {
    const result = mergeDuplicateFindings([
      finding({
        severity: "medium",
        description: "Medium description",
        mitigation: "Medium mitigation",
        vulnerability_details: { severity: "medium", owasp: "LLM01" },
      }),
      finding({
        severity: "critical",
        description: "Critical description",
        mitigation: "Critical mitigation",
        vulnerability_details: { severity: "critical", owasp: "LLM01" },
      }),
    ]);
    expect(result[0].severity).toBe("critical");
    expect(result[0].description).toBe("Critical description");
    expect(result[0].mitigation).toBe("Critical mitigation");
    expect(result[0].vulnerability_details).toEqual({ severity: "critical", owasp: "LLM01" });
  });

  it("keeps the first variant's details when severities are equal or lower", () => {
    const result = mergeDuplicateFindings([
      finding({ severity: "high", mitigation: "First", vulnerability_details: { a: 1 } }),
      finding({ severity: "low", mitigation: "Second", vulnerability_details: { a: 2 } }),
    ]);
    expect(result[0].severity).toBe("high");
    expect(result[0].mitigation).toBe("First");
    expect(result[0].vulnerability_details).toEqual({ a: 1 });
  });

  it("merges model security inputs, keeping the highest severity and its CWE", () => {
    const base = {
      scan_id: 1,
      finding_type: "model_security" as const,
      category: "Model security",
      name: "Pickle deserialization",
      provider: "pickle",
      confidence: "high" as const,
      cwe_name: "",
      owasp_ml_id: "ML06",
      owasp_ml_name: "AI supply chain attacks",
      threat_type: "code_execution",
      operator_name: "",
      module_name: "",
    };
    const result = mergeDuplicateFindings([
      {
        ...base,
        severity: "high" as const,
        cwe_id: "CWE-1",
        file_paths: [{ path: "a.pkl", line_number: null, matched_text: "x" }],
      },
      {
        ...base,
        name: "pickle deserialization",
        severity: "critical" as const,
        cwe_id: "CWE-502",
        file_paths: [{ path: "b.pkl", line_number: null, matched_text: "y" }],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("critical");
    expect(result[0].cwe_id).toBe("CWE-502");
    expect(result[0].file_count).toBe(2);
  });

  it("does not mutate its inputs", () => {
    const a = finding({});
    const b = finding({ name: "Qdrant" });
    mergeDuplicateFindings([a, b]);
    expect(a.name).toBe("qdrant");
    expect(a.file_paths).toHaveLength(1);
  });
});

describe("findingMergeKey", () => {
  it("ignores case and surrounding whitespace and treats a missing provider as NULL", () => {
    expect(findingMergeKey({ scan_id: 1, name: " Qdrant ", provider: "QDRANT" })).toBe(
      findingMergeKey({ scan_id: 1, name: "qdrant", provider: "Qdrant" }),
    );
    expect(findingMergeKey({ scan_id: 1, name: "x", provider: undefined })).toBe("1::x::NULL");
  });
});
