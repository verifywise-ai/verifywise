import React from "react";
import { Box } from "@mui/material";
import { accent, background, risk, status, text as textPalette } from "../../themes/palette";

export interface TagChipProps {
  tag: string;
}

// Define color schemes for official POLICY_TAGS (palette tokens only)
const getTagStyle = (tag: string) => {
  const tagLower = tag.toLowerCase();

  // Color mapping based on official POLICY_TAGS from backend
  const tagStyles: Record<string, { bg: string; color: string }> = {
    // Ethics & Fairness — green
    "ai ethics": { bg: status.success.bg, color: status.success.text },
    "fairness": { bg: status.success.bg, color: status.success.text },
    "bias mitigation": { bg: accent.primary.bg, color: accent.primary.text },

    // Transparency & Explainability — blue
    "transparency": { bg: status.info.bg, color: status.info.text },
    "explainability": { bg: accent.blue.bg, color: accent.blue.text },

    // Privacy & Data Governance — purple
    "privacy": { bg: accent.purple.bg, color: accent.purple.text },
    "data governance": { bg: accent.purple.bg, color: accent.purple.text },

    // Risk & Security — orange / amber
    "model risk": { bg: risk.high.bg, color: risk.high.text },
    "security": { bg: accent.amber.bg, color: accent.amber.text },

    // Accountability & Oversight — purple / indigo
    "accountability": { bg: accent.purple.bg, color: accent.purple.text },
    "human oversight": { bg: accent.indigo.bg, color: accent.indigo.text },

    // Compliance & Standards — amber / orange
    "eu ai act": { bg: accent.amber.bg, color: accent.amber.text },
    "iso 42001": { bg: accent.orange.bg, color: accent.orange.text },
    "nist rmf": { bg: accent.amber.bg, color: accent.amber.text },

    // LLM Specific — teal
    "llm": { bg: accent.teal.bg, color: accent.teal.text },
  };

  // Check for exact matches (case-insensitive)
  for (const [key, style] of Object.entries(tagStyles)) {
    if (tagLower === key) {
      return style;
    }
  }

  // Default style for unmatched tags
  return { bg: background.surface, color: textPalette.subdued };
};

const TagChip: React.FC<TagChipProps> = ({ tag }) => {
  const style = getTagStyle(tag);

  return (
    <Box
      component="span"
      sx={{
        backgroundColor: style.bg,
        color: style.color,
        padding: "4px 8px",
        borderRadius: "4px",
        fontWeight: 500,
        fontSize: 11,
        textTransform: "uppercase",
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {tag}
    </Box>
  );
};

export default TagChip;
