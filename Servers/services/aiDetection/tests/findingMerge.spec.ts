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

  it("keeps a merged finding suppressed only when every variant was suppressed", () => {
    const partly = mergeDuplicateFindings([
      finding({ suppressed: true, suppression_rule_id: 4 }),
      finding({ name: "Qdrant", suppressed: false }),
    ]);
    expect(partly[0].suppressed).toBe(false);
    expect(partly[0].suppression_rule_id).toBeNull();

    const fully = mergeDuplicateFindings([
      finding({ suppressed: true, suppression_rule_id: 4 }),
      finding({ name: "Qdrant", suppressed: true, suppression_rule_id: 4 }),
    ]);
    expect(fully[0].suppressed).toBe(true);
    expect(fully[0].suppression_rule_id).toBe(4);
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
