import React from "react";
import StatusBadge from "../StatusBadge";
import { ChipVariant } from "../../types/interfaces/i.chip";

export interface TagChipProps {
  tag: string;
}

const TAG_VARIANTS: Record<string, ChipVariant> = {
  "ai ethics": "success",
  "fairness": "success",
  "bias mitigation": "success",
  "transparency": "info",
  "explainability": "info",
  "privacy": "info",
  "data governance": "info",
  "model risk": "high",
  "security": "warning",
  "accountability": "info",
  "human oversight": "info",
  "eu ai act": "warning",
  "iso 42001": "warning",
  "nist rmf": "warning",
  "llm": "info",
};

const getTagVariant = (tag: string): ChipVariant => TAG_VARIANTS[tag.toLowerCase()] ?? "default";

const TagChip: React.FC<TagChipProps> = ({ tag }) => (
  <StatusBadge label={tag} variant={getTagVariant(tag)} size="small" />
);

export default TagChip;
