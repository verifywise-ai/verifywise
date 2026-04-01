import React, { useState, useEffect, useRef } from "react";
import { Stack, Typography, LinearProgress, useTheme } from "@mui/material";
import { styles } from "./styles";
import { IStatusProps } from "../../../../../domain/interfaces/i.status";
import { brand } from "../../../../themes/palette";

const STANDARD_DURATION = 10; // seconds
const AI_DURATION = 30; // seconds

const AI_PHASES = [
  "Collecting data...",
  "Generating AI analysis...",
  "Building document...",
];

const DownloadReportForm: React.FC<IStatusProps> = ({
  statusCode,
  aiEnhanced = false,
}) => {
  const theme = useTheme();
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isComplete = statusCode !== 200;
  const estimatedDuration = aiEnhanced ? AI_DURATION : STANDARD_DURATION;

  // Phase transitions for AI-enhanced
  useEffect(() => {
    if (!aiEnhanced || isComplete) return;

    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => setPhase(1), 3000));
    timers.push(setTimeout(() => setPhase(2), 8000));

    return () => timers.forEach(clearTimeout);
  }, [aiEnhanced, isComplete]);

  // Simulated progress
  useEffect(() => {
    if (isComplete) {
      setProgress(100);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const tick = 500;
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + tick / 1000;
        // Ease towards 95%, never exceed until complete
        const ratio = next / estimatedDuration;
        const simulated = 95 * (1 - Math.exp(-3 * ratio));
        setProgress(Math.min(simulated, 95));
        return next;
      });
    }, tick);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isComplete, estimatedDuration]);

  const remaining = Math.max(0, Math.ceil(estimatedDuration - elapsed));

  return (
    <>
      {statusCode === 200 ? (
        <Stack sx={styles.container}>
          <Typography sx={styles.titleText}>
            {aiEnhanced ? AI_PHASES[phase] : "Preparing your report..."}
          </Typography>

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 6,
              borderRadius: 3,
              mb: 2,
              backgroundColor: theme.palette.border.light,
              "& .MuiLinearProgress-bar": {
                backgroundColor: `${brand.primary}`,
                borderRadius: 3,
                transition: "transform 0.5s ease",
              },
            }}
          />

          <Typography sx={styles.baseText}>
            {remaining > 0
              ? `About ${remaining} second${remaining !== 1 ? "s" : ""} remaining...`
              : "Almost there..."}
          </Typography>

          <Typography
            sx={{
              fontSize: 11,
              color: theme.palette.text.accent,
              mt: 1,
            }}
          >
            {aiEnhanced
              ? "AI-enhanced reports take a bit longer. Your report will download automatically."
              : "Your report will download automatically when ready."}
          </Typography>
        </Stack>
      ) : (
        <>
          {statusCode === 403 ? (
            <Stack sx={styles.container}>
              <Typography sx={{ ...styles.titleText, color: "error.main" }}>
                Access denied...
              </Typography>
              <Typography sx={{ ...styles.baseText, color: "error.main" }}>
                It looks like you're not authorized to generate this report, as
                you're not part of the selected project.
              </Typography>
            </Stack>
          ) : (
            <Stack sx={styles.container}>
              <Typography sx={{ ...styles.titleText, color: "error.main" }}>
                Sorry...
              </Typography>
              <Typography sx={{ ...styles.baseText, color: "error.main" }}>
                Unexpected error occurs while downloading the report.
              </Typography>
            </Stack>
          )}
        </>
      )}
    </>
  );
};

export default DownloadReportForm;
