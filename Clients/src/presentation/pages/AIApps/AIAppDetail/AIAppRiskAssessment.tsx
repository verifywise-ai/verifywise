import { useEffect, useMemo, useState } from "react";
import { Box, Stack, Typography, Grid } from "@mui/material";
import { Gauge } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Select from "../../../components/Inputs/Select";
import { useUpdateAiApp } from "../../../../application/hooks/useAiApps";
import { palette } from "../../../themes/palette";
import Alert from "../../../components/Alert";
import Chip from "../../../components/Chip";
import {
  RISK_CRITERIA,
  RISK_SCORE_OPTIONS,
  DEFAULT_CRITERION_SCORE,
  buildDefaultScores,
  calculateRiskScore,
  getRiskLevel,
  scoresFromRiskScore,
} from "../utils";

interface AIAppRiskAssessmentProps {
  appId: number;
  currentRiskScore?: number | null;
}

export default function AIAppRiskAssessment({ appId, currentRiskScore }: AIAppRiskAssessmentProps) {
  const [scores, setScores] = useState<Record<string, number>>(() => buildDefaultScores());
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    body: string;
  } | null>(null);

  const updateMutation = useUpdateAiApp();

  // Auto-dismiss toasts after 3s.
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  useEffect(() => {
    setScores(scoresFromRiskScore(currentRiskScore));
  }, [currentRiskScore]);

  const calculatedScore = useMemo(() => calculateRiskScore(scores), [scores]);
  const calculatedLevel = useMemo(() => getRiskLevel(calculatedScore), [calculatedScore]);
  const currentLevel = useMemo(
    () => (currentRiskScore != null ? getRiskLevel(currentRiskScore) : null),
    [currentRiskScore],
  );

  const handleChange = (key: string, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: appId,
        data: { risk_score: calculatedScore },
      });
      setAlert({ variant: "success", body: `Risk score updated to ${calculatedScore}` });
    } catch (err) {
      setAlert({ variant: "error", body: "Failed to save risk assessment" });
    }
  };

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
        sx={{ mb: "16px" }}
      >
        <Stack direction="row" alignItems="center" gap="8px">
          <Gauge
            size={16}
            strokeWidth={1.5}
            color={palette.text.secondary}
            style={{ flexShrink: 0, overflow: "visible" }}
          />
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Risk assessment</Typography>
        </Stack>
        <CustomizableButton
          text="Save assessment"
          variant="contained"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        />
      </Stack>

      <Box
        sx={{
          mb: "24px",
          p: "16px",
          borderRadius: "4px",
          backgroundColor: palette.background.accent,
          border: `1px solid ${palette.border.light}`,
        }}
      >
        <Stack direction="row" alignItems="center" gap="16px" flexWrap="wrap">
          <Box>
            <Typography sx={{ fontSize: 12, color: palette.text.secondary, mb: "4px" }}>
              Current risk score
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700 }}>
              {currentRiskScore ?? "—"}
            </Typography>
            {currentLevel && (
              <Chip
                label={currentLevel.label}
                size="small"
                uppercase={false}
                textColor={currentLevel.color}
                backgroundColor="transparent"
              />
            )}
          </Box>
          <Box
            sx={{
              width: "1px",
              alignSelf: "stretch",
              backgroundColor: palette.border.light,
              display: { xs: "none", sm: "block" },
            }}
          />
          <Box>
            <Typography sx={{ fontSize: 12, color: palette.text.secondary, mb: "4px" }}>
              Calculated risk score
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700 }}>{calculatedScore}</Typography>
            <Chip
              label={calculatedLevel.label}
              size="small"
              uppercase={false}
              textColor={calculatedLevel.color}
              backgroundColor="transparent"
            />
          </Box>
        </Stack>
      </Box>

      <Grid container sx={{ gap: "32px 0" }}>
        {RISK_CRITERIA.map((criterion) => (
          <Grid size={{ xs: 12, md: 6 }} key={criterion.key}>
            <Box sx={{ pr: { md: "16px" } }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: "4px" }}>
                {criterion.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: palette.text.secondary,
                  mb: "12px",
                }}
              >
                {criterion.description}
              </Typography>
              <Select
                id={`risk-${criterion.key}`}
                value={scores[criterion.key] ?? DEFAULT_CRITERION_SCORE}
                onChange={(e) => handleChange(criterion.key, Number(e.target.value))}
                items={[...RISK_SCORE_OPTIONS]}
                sx={{ width: "100%" }}
              />
            </Box>
          </Grid>
        ))}
      </Grid>

      {alert && (
        <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
      )}
    </Box>
  );
}
