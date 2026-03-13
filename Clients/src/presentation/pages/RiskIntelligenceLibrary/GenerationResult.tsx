import {
  Box,
  Chip,
  Divider,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import {
  GeneratedRisk,
  GeneratedMitigation,
  GeneratedAssessment,
} from "../../../domain/types/RiskLibrary";

const strategyColors: Record<string, string> = {
  avoid: "#d32f2f",
  transfer: "#1565c0",
  mitigate: "#2e7d32",
  accept: "#f57c00",
};

// ─── Risk Card ────────────────────────────────────────────────────────────

export const GeneratedRiskCard = ({ risk }: { risk: GeneratedRisk }) => (
  <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
      {risk.summary}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      {risk.description}
    </Typography>
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
      {risk.risk_type && <Chip label={risk.risk_type} size="small" />}
      {risk.domain && <Chip label={risk.domain} size="small" variant="outlined" />}
      {risk.eu_ai_act_tier && (
        <Chip label={`EU AI Act: ${risk.eu_ai_act_tier}`} size="small" variant="outlined" />
      )}
      {risk.severity && <Chip label={risk.severity} size="small" variant="outlined" />}
      {risk.likelihood && <Chip label={risk.likelihood} size="small" variant="outlined" />}
    </Box>
    {risk.marginal_risk_description && (
      <Box sx={{ mt: 1, p: 1, backgroundColor: "action.hover", borderRadius: 1 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          Marginal Risk:
        </Typography>
        <Typography variant="caption" sx={{ ml: 0.5 }}>
          {risk.marginal_risk_description}
        </Typography>
      </Box>
    )}
  </Box>
);

// ─── Mitigation Card ──────────────────────────────────────────────────────

export const GeneratedMitigationCard = ({
  mitigation,
}: {
  mitigation: GeneratedMitigation;
}) => (
  <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
      <Chip
        label={mitigation.strategy.toUpperCase()}
        size="small"
        sx={{
          backgroundColor: strategyColors[mitigation.strategy] || "#757575",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      />
      <Typography variant="subtitle2" fontWeight={600}>
        {mitigation.title}
      </Typography>
    </Box>
    <Typography variant="body2" sx={{ mb: 1 }}>
      {mitigation.description}
    </Typography>
    {mitigation.implementation_guidance && (
      <Box sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          Implementation:
        </Typography>
        <Typography variant="caption" sx={{ ml: 0.5 }}>
          {mitigation.implementation_guidance}
        </Typography>
      </Box>
    )}
    {mitigation.evidence_requirements && (
      <Box sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          Evidence:
        </Typography>
        <Typography variant="caption" sx={{ ml: 0.5 }}>
          {mitigation.evidence_requirements}
        </Typography>
      </Box>
    )}
    {mitigation.framework_ref && (
      <Chip
        label={mitigation.framework_ref}
        size="small"
        variant="outlined"
        sx={{ mt: 0.5, fontSize: "0.65rem" }}
      />
    )}
  </Box>
);

// ─── Taxonomy Result ──────────────────────────────────────────────────────

export const TaxonomyResult = ({
  risks,
  generationId,
  onFeedback,
}: {
  risks: GeneratedRisk[];
  generationId?: number;
  onFeedback?: (params: { id: number; feedback_type: "upvote" | "downvote" | "flag" }) => void;
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="subtitle1" fontWeight={700}>
        Generated Risks ({risks.length})
      </Typography>
      {generationId && onFeedback && (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Good results">
            <IconButton
              size="small"
              onClick={() => onFeedback({ id: generationId, feedback_type: "upvote" })}
            >
              <ThumbsUp size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Poor results">
            <IconButton
              size="small"
              onClick={() => onFeedback({ id: generationId, feedback_type: "downvote" })}
            >
              <ThumbsDown size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
    {risks.map((risk, i) => (
      <GeneratedRiskCard key={i} risk={risk} />
    ))}
  </Box>
);

// ─── Mitigations Result ───────────────────────────────────────────────────

export const MitigationsResult = ({
  mitigations,
  generationId,
  onFeedback,
}: {
  mitigations: GeneratedMitigation[];
  generationId?: number;
  onFeedback?: (params: { id: number; feedback_type: "upvote" | "downvote" | "flag" }) => void;
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="subtitle1" fontWeight={700}>
        Generated Mitigations ({mitigations.length})
      </Typography>
      {generationId && onFeedback && (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Good results">
            <IconButton
              size="small"
              onClick={() => onFeedback({ id: generationId, feedback_type: "upvote" })}
            >
              <ThumbsUp size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Poor results">
            <IconButton
              size="small"
              onClick={() => onFeedback({ id: generationId, feedback_type: "downvote" })}
            >
              <ThumbsDown size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
    {mitigations.map((m, i) => (
      <GeneratedMitigationCard key={i} mitigation={m} />
    ))}
  </Box>
);

// ─── Assessment Result ────────────────────────────────────────────────────

export const AssessmentResult = ({
  assessment,
  generationId,
  onFeedback,
}: {
  assessment: GeneratedAssessment;
  generationId?: number;
  onFeedback?: (params: { id: number; feedback_type: "upvote" | "downvote" | "flag" }) => void;
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="subtitle1" fontWeight={700}>
        Risk Assessment
      </Typography>
      {generationId && onFeedback && (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Good results">
            <IconButton
              size="small"
              onClick={() => onFeedback({ id: generationId, feedback_type: "upvote" })}
            >
              <ThumbsUp size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Poor results">
            <IconButton
              size="small"
              onClick={() => onFeedback({ id: generationId, feedback_type: "downvote" })}
            >
              <ThumbsDown size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>

    <Box sx={{ p: 2, backgroundColor: "action.hover", borderRadius: 1 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {assessment.summary}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Chip label={`Overall: ${assessment.overall_risk_level}`} size="small" />
        <Chip
          label={`EU AI Act: ${assessment.eu_ai_act_tier}`}
          size="small"
          variant="outlined"
        />
      </Box>
    </Box>

    <Divider />

    {assessment.risks.map((risk, i) => (
      <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <GeneratedRiskCard risk={risk} />
        {risk.mitigations && risk.mitigations.length > 0 && (
          <Box sx={{ pl: 2, display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              Suggested Mitigations:
            </Typography>
            {risk.mitigations.map((m, j) => (
              <GeneratedMitigationCard key={j} mitigation={m} />
            ))}
          </Box>
        )}
      </Box>
    ))}
  </Box>
);
