import { Box } from "@mui/material";
import { useEvidenceGaps } from "../../../application/hooks/useEvidenceAi";
import EvidenceGapChart from "../../components/EvidenceGapChart";

/**
 * Framework evidence coverage, from GET /api/evidence-ai/gaps: the EU AI Act
 * controls and ISO 42001 annex categories that have no evidence linked, or only
 * evidence the AI analysis graded low.
 *
 * Rendered only while the Evidence hub tab is open, so the other tabs of this
 * page do not pay for the request.
 */
export default function EvidenceCoveragePanel() {
  const { data, isLoading } = useEvidenceGaps();

  return (
    <Box sx={{ mb: "16px" }}>
      <EvidenceGapChart data={data ?? null} isLoading={isLoading} />
    </Box>
  );
}
