import { useState, type ChangeEvent } from "react";
import { Box, Collapse, Typography } from "@mui/material";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import type { TierSuggestion } from "../../../application/repository/intakeTierSuggestion.repository";

export const MAX_TIER_CONTEXT_CHARS = 1000;

export type TierChoice = "accept" | "context" | null;

export interface TierResponseState {
  choice: TierChoice;
  context: string;
}

interface TierSuggestionCardProps {
  suggestion: TierSuggestion | null;
  loading: boolean;
  /** True when the form may call AI (live checks on and a key set). */
  aiAvailable: boolean;
  onExplain: () => Promise<string | null>;
  response: TierResponseState;
  onResponseChange: (next: TierResponseState) => void;
}

/**
 * The risk level suggested from the applicant's risk step answers, with the
 * articles behind it. The applicant can accept it or add context; governance
 * decides. The level and references come from the rules engine; AI only
 * explains them, and only when asked.
 */
export function TierSuggestionCard({
  suggestion,
  loading,
  aiAvailable,
  onExplain,
  response,
  onResponseChange,
}: TierSuggestionCardProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainFailed, setExplainFailed] = useState(false);

  if (loading) {
    return (
      <Box
        data-testid="tier-suggestion-loading"
        sx={{ mb: "24px", display: "flex", alignItems: "center", gap: "8px" }}
      >
        <Loader2 size={14} strokeWidth={1.5} className="spin" />
        <Typography sx={{ fontSize: "13px", color: "#475569" }}>
          Working out the suggested risk level
        </Typography>
      </Box>
    );
  }
  if (!suggestion) return null;

  const explain = async () => {
    setExplaining(true);
    setExplainFailed(false);
    try {
      const text = await onExplain();
      setExplanation(text);
      setExplainFailed(text === null);
    } catch {
      setExplainFailed(true);
    } finally {
      setExplaining(false);
    }
  };

  return (
    <Box
      data-testid="tier-suggestion"
      sx={{
        mb: "24px",
        p: "16px",
        border: "1px solid #d0d5dd",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <Box>
        <Typography sx={{ fontSize: "13px", color: "#475569" }}>
          Suggested risk level from your answers
        </Typography>
        <Typography
          data-testid="tier-suggestion-level"
          sx={{ fontSize: "16px", fontWeight: 600, color: "#1e293b" }}
        >
          {suggestion.level}
        </Typography>
      </Box>

      {suggestion.reasons.length > 0 && (
        <Box
          component="ul"
          sx={{ m: 0, pl: "18px", display: "flex", flexDirection: "column", gap: "4px" }}
        >
          {suggestion.reasons.map((reason) => (
            <Box
              component="li"
              key={`${reason.article}-${reason.text}`}
              sx={{ fontSize: "13px", color: "#334155" }}
            >
              <span>{reason.text}</span>{" "}
              <Box component="span" sx={{ color: "#64748b" }}>
                ({reason.article})
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {suggestion.obligations.length > 0 && (
        <Box>
          <Box
            component="button"
            type="button"
            aria-expanded={whyOpen}
            onClick={() => setWhyOpen((v) => !v)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              p: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              color: "#334155",
            }}
          >
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              style={{ transform: whyOpen ? "rotate(180deg)" : "none" }}
            />
            <span>Why this matters</span>
          </Box>
          <Collapse in={whyOpen}>
            <Box
              component="ul"
              sx={{
                m: "8px 0 0",
                pl: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {suggestion.obligations.map((item) => (
                <Box
                  component="li"
                  key={`${item.article}-${item.text}`}
                  sx={{ fontSize: "13px", color: "#334155" }}
                >
                  <span>{item.text}</span>{" "}
                  <Box component="span" sx={{ color: "#64748b" }}>
                    ({item.article})
                  </Box>
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {aiAvailable && !explanation && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <CustomizableButton
            variant="outlined"
            text={explaining ? "Explaining" : "Explain in plain words"}
            onClick={explain}
            isDisabled={explaining}
            testId="tier-explain"
            startIcon={<Sparkles size={14} strokeWidth={1.5} />}
          />
          <Typography sx={{ fontSize: "13px", color: "#64748b" }}>
            Sends your risk answers to AI.
          </Typography>
        </Box>
      )}
      {explanation && (
        <Typography data-testid="tier-explanation" sx={{ fontSize: "13px", color: "#334155" }}>
          {explanation}
        </Typography>
      )}
      {explainFailed && (
        <Typography sx={{ fontSize: "13px", color: "#64748b" }}>
          An explanation isn't available right now. The reasons above still apply.
        </Typography>
      )}

      <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <CustomizableButton
          variant={response.choice === "accept" ? "contained" : "outlined"}
          text="Accept"
          onClick={() => onResponseChange({ choice: "accept", context: "" })}
          testId="tier-accept"
        />
        <CustomizableButton
          variant={response.choice === "context" ? "contained" : "outlined"}
          text="Add context"
          onClick={() => onResponseChange({ choice: "context", context: response.context })}
          testId="tier-add-context"
        />
      </Box>

      {response.choice === "context" && (
        <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <Typography component="span" sx={{ fontSize: "13px", fontWeight: 500, color: "#334155" }}>
            What should the reviewer know?
          </Typography>
          <Box
            component="textarea"
            data-testid="tier-context"
            value={response.context}
            maxLength={MAX_TIER_CONTEXT_CHARS}
            rows={3}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              onResponseChange({ choice: "context", context: e.target.value })
            }
            sx={{
              fontFamily: "inherit",
              fontSize: "13px",
              p: "8px",
              border: "1px solid #d0d5dd",
              borderRadius: "4px",
              resize: "vertical",
            }}
          />
        </Box>
      )}

      <Typography sx={{ fontSize: "13px", color: "#64748b" }}>
        The governance team makes the final call.
      </Typography>
    </Box>
  );
}
