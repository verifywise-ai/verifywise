export const toolsDefinition: any[] = [
  {
    type: "function",
    function: {
      name: "analyze_document",
      description:
        "Analyze an uploaded document for compliance relevance. Extracts summary, key findings, and compliance areas from the document content.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to analyze.",
          },
          document_text: {
            type: "string",
            description: "The extracted text content of the document to analyze.",
          },
        },
        required: ["file_id", "document_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "score_evidence_quality",
      description:
        "Score the quality of evidence across 5 dimensions: relevance, completeness, recency, reliability, and specificity. Each dimension is scored 0-100.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to score.",
          },
          summary: {
            type: "string",
            description: "Summary of the document content.",
          },
          key_findings: {
            type: "string",
            description: "Key findings from the document as a JSON string array.",
          },
          compliance_areas: {
            type: "string",
            description: "Identified compliance areas as a JSON string array.",
          },
        },
        required: ["file_id", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "match_controls",
      description:
        "Match document content against control requirements and suggest which controls this evidence supports. Returns suggested file_entity_links.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "number",
            description: "The ID of the file to match.",
          },
          compliance_areas: {
            type: "string",
            description: "Identified compliance areas as a JSON string array.",
          },
          framework_type: {
            type: "string",
            description: "Filter to a specific framework type (e.g., 'eu_ai_act', 'iso_42001').",
          },
        },
        required: ["file_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_evidence_gaps",
      description:
        "Detect controls that lack evidence or have only low-quality evidence. Returns gap analysis with recommendations.",
      parameters: {
        type: "object",
        properties: {
          framework_type: {
            type: "string",
            description: "Filter to a specific framework type (e.g., 'eu_ai_act', 'iso_42001').",
          },
          project_id: {
            type: "number",
            description: "Filter to a specific project.",
          },
          quality_threshold: {
            type: "number",
            description: "Minimum quality score to consider evidence adequate (default: 50).",
          },
        },
        required: [],
      },
    },
  },
];
