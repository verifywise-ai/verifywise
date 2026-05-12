import { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Stack,
  CircularProgress,
  Divider,
  Alert,
  SelectChangeEvent,
} from "@mui/material";
import { Compass } from "lucide-react";
import Select from "../../components/Inputs/Select";
import ScenarioCard from "../../components/GovernanceOS/ScenarioCard";
import { EmptyState } from "../../components/EmptyState";
import {
  useScenarios,
  useRecommendations,
  useGovernancePreferences,
  useUpdatePreferences,
} from "../../../application/hooks/useGovernanceOs";
import {
  IRecommendationRequest,
  IGovernanceScenario,
} from "../../../domain/interfaces/i.governanceOs";
import { border as borderPalette, background } from "../../themes/palette";

const INDUSTRIES = [
  { _id: "technology", name: "Technology" },
  { _id: "healthcare", name: "Healthcare" },
  { _id: "finance", name: "Financial Services" },
  { _id: "public_sector", name: "Public Sector" },
  { _id: "manufacturing", name: "Manufacturing" },
  { _id: "education", name: "Education" },
  { _id: "energy", name: "Energy" },
  { _id: "retail", name: "Retail" },
];

const REGIONS = [
  { _id: "eu", name: "European Union" },
  { _id: "us", name: "United States" },
  { _id: "global", name: "Global" },
  { _id: "apac", name: "Asia-Pacific" },
  { _id: "uk", name: "United Kingdom" },
];

const RISK_LEVELS = [
  { _id: "high", name: "High Risk" },
  { _id: "limited", name: "Limited Risk" },
  { _id: "minimal", name: "Minimal Risk" },
];

const USE_CASE_TYPES = [
  { _id: "high_risk_ai", name: "High-Risk AI System" },
  { _id: "general_purpose_ai", name: "General-Purpose AI" },
  { _id: "limited_risk", name: "Limited Risk AI" },
];

const ScenarioBuilder = () => {
  const { data: scenarios, isLoading: scenariosLoading } = useScenarios();
  const { data: preferences } = useGovernancePreferences();
  const updatePreferencesMutation = useUpdatePreferences();
  const recommendMutation = useRecommendations();

  const [formData, setFormData] = useState<IRecommendationRequest>({
    industry: "",
    region: "",
    riskLevel: "",
    useCaseType: "",
    deploymentScale: "",
  });

  const selectedScenarioId = preferences?.selected_scenario_id ?? null;

  const handleRecommend = () => {
    recommendMutation.mutate(formData);
  };

  const handleSelectScenario = (scenario: IGovernanceScenario) => {
    updatePreferencesMutation.mutate({ selected_scenario_id: scenario.id });
  };

  const canRecommend =
    formData.industry || formData.region || formData.riskLevel || formData.useCaseType;

  return (
    <Stack spacing={3}>
      <Typography variant="body2" sx={{ color: "#475467" }}>
        Get framework recommendations based on your organization context, or browse pre-built
        governance scenarios.
      </Typography>

      {/* Recommendation form */}
      <Box
        sx={{
          border: `1px solid ${borderPalette.dark}`,
          borderRadius: 2,
          p: 3,
          background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 3, fontWeight: 600 }}>
          Get Recommendations
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="flex-end">
          <Select
            id="industry-select"
            label="Industry"
            placeholder="Any"
            value={formData.industry || ""}
            items={INDUSTRIES}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, industry: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <Select
            id="region-select"
            label="Region"
            placeholder="Any"
            value={formData.region || ""}
            items={REGIONS}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, region: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <Select
            id="risk-level-select"
            label="Risk Level"
            placeholder="Any"
            value={formData.riskLevel || ""}
            items={RISK_LEVELS}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, riskLevel: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <Select
            id="use-case-type-select"
            label="Use Case Type"
            placeholder="Any"
            value={formData.useCaseType || ""}
            items={USE_CASE_TYPES}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormData({ ...formData, useCaseType: e.target.value as string })
            }
            sx={{ minWidth: 170 }}
          />

          <Button
            variant="contained"
            onClick={handleRecommend}
            disabled={recommendMutation.isPending || !canRecommend}
            sx={{ alignSelf: "flex-end", minWidth: 140, height: 34 }}
          >
            {recommendMutation.isPending ? <CircularProgress size={20} /> : "Get Recommendations"}
          </Button>
        </Stack>
      </Box>

      {/* Recommendation results */}
      {recommendMutation.data && recommendMutation.data.length > 0 && (
        <Stack spacing={2}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Recommended Scenarios
          </Typography>
          <Stack spacing={2}>
            {recommendMutation.data.map((result) => (
              <ScenarioCard
                key={result.scenario.id}
                scenario={result.scenario}
                score={result.score}
                matchedRules={result.matchedRules}
                isSelected={selectedScenarioId === result.scenario.id}
                onSelect={handleSelectScenario}
              />
            ))}
          </Stack>
        </Stack>
      )}

      {recommendMutation.data && recommendMutation.data.length === 0 && (
        <Alert severity="info">
          No strong matches found. Try adjusting your criteria or browse the scenarios below.
        </Alert>
      )}

      <Divider />

      {/* All scenarios */}
      <Stack spacing={2}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          All Governance Scenarios
        </Typography>

        {scenariosLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={32} />
          </Stack>
        ) : !scenarios || scenarios.length === 0 ? (
          <EmptyState message="No governance scenarios available." icon={Compass} showBorder />
        ) : (
          <Stack spacing={2}>
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                isSelected={selectedScenarioId === scenario.id}
                onSelect={handleSelectScenario}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export default ScenarioBuilder;
