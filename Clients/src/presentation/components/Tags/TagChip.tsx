import React from "react";
import { Box } from "@mui/material";
import { accent, background, risk, status, text as textPalette } from "../../themes/palette";

export interface TagChipProps {
  tag: string;
}

// Define color schemes for official POLICY_TAGS
const getTagStyle = (tag: string) => {
  const tagLower = tag.toLowerCase();

  // Color mapping based on official POLICY_TAGS from backend
  const tagStyles: Record<string, { bg: string; color: string }> = {
    // Ethics & Fairness - Green tones
    "ai ethics": { bg: `${status.success.bg}`, color: `${status.success.text}` },
    fairness: { bg: "#E8F5E9", color: "#2E7D32" },
    "bias mitigation": { bg: "#F1F8E9", color: "#558B2F" },

    // Transparency & Explainability - Blue tones
    transparency: { bg: `${status.info.bg}`, color: `${status.info.text}` },
    explainability: { bg: "#E1F5FE", color: "#0277BD" },

    // Privacy & Data Governance - Purple tones
    privacy: { bg: "#F3E5F5", color: "#6A1B9A" },
    "data governance": { bg: `${accent.purple.bg}`, color: "#4527A0" },

    // Risk & Security - Orange/Red tones
    "model risk": { bg: `${risk.high.bg}`, color: `${risk.high.text}` },
    security: { bg: `${accent.amber.border}`, color: "#F57F17" },

    // Accountability & Oversight - Deep Purple
    accountability: { bg: `${accent.purple.bg}`, color: `${accent.purple.text}` },
    "human oversight": { bg: `${accent.indigo.bg}`, color: `${accent.indigo.text}` },

    // Compliance & Standards - Amber/Brown tones
    "eu ai act": { bg: `${accent.amber.bg}`, color: "#F57C00" },
    "iso 42001": { bg: `${accent.orange.bg}`, color: "#EF6C00" },
    "nist rmf": { bg: `${accent.amber.border}`, color: "#F9A825" },

    // LLM Specific - Cyan
    llm: { bg: `${risk.veryLow.bg}`, color: "#00838F" },
  };

  // Check for exact matches (case-insensitive)
  for (const [key, style] of Object.entries(tagStyles)) {
    if (tagLower === key) {
      return style;
    }
  }

  // Default style for unmatched tags
  return { bg: `${background.surface}`, color: `${textPalette.subdued}` };
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
