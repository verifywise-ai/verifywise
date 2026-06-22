// Per-domain bars + the full indicator checklist. Ported from the public website
// (components/ai-trust-index/score-breakdown.tsx). Half awards label as "Partial".
import { Box, Stack, Typography } from "@mui/material";
import {
  RUBRIC_DOMAINS,
  INDICATOR_LABELS,
  SUBFLAG_LABELS,
  AWARD_LABELS,
  summarizeDomains,
  type IndicatorMap,
} from "../rubric";
import { palette } from "../../../themes/palette";

function ratioColor(r: number): string {
  if (r >= 0.75) return "#13715B";
  if (r >= 0.5) return "#2E8B6F";
  if (r >= 0.3) return "#C8941E";
  if (r > 0) return "#C2683B";
  return "#B23B3B";
}

function dot(award: string, subFlag?: string): { color: string; label: string } {
  if (award === "full") return { color: "#13715B", label: AWARD_LABELS.full };
  if (award === "half") return { color: "#C8941E", label: AWARD_LABELS.half };
  if (subFlag === "ADVERSE") return { color: "#B23B3B", label: SUBFLAG_LABELS.ADVERSE };
  if (subFlag === "NA") return { color: "#98A2B3", label: SUBFLAG_LABELS.NA };
  return { color: palette.border.dark, label: SUBFLAG_LABELS.SILENT };
}

export function ScoreBreakdown({
  indicators,
  appName,
}: {
  indicators: IndicatorMap;
  appName?: string;
}) {
  const domains = summarizeDomains(indicators);
  return (
    <Box>
      <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: "12px" }}>
        {appName ? `${appName} privacy rating` : "Privacy rating"}
      </Typography>
      <Box
        sx={{
          border: `1px solid ${palette.border.dark}`,
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        {RUBRIC_DOMAINS.map((domain, di) => {
          const d = domains.find((x) => x.id === domain.id);
          const ids = Object.keys(indicators)
            .filter((k) => k.startsWith(domain.id + "."))
            .sort();
          if (!d || ids.length === 0) return null;
          const ratio = d.ratio ?? 0;
          const allNa = d.applicable === 0;
          return (
            <Box key={domain.id}>
              <Box
                sx={{
                  backgroundColor: palette.background.accent,
                  px: "16px",
                  py: "12px",
                  borderTop: di === 0 ? "none" : `1px solid ${palette.border.dark}`,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                  gap="8px"
                  sx={{ mb: "8px" }}
                >
                  <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>{domain.name}</Typography>
                  <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                    {allNa ? "Not scored" : `${d.full} of ${d.applicable} disclosed`}
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    height: "8px",
                    borderRadius: "999px",
                    backgroundColor: "#E5E7EB",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      width: `${Math.round(ratio * 100)}%`,
                      backgroundColor: ratioColor(ratio),
                      borderRadius: "999px",
                    }}
                  />
                </Box>
              </Box>
              {ids.map((id) => {
                const a = indicators[id];
                const dd = dot(a.award, a.subFlag);
                return (
                  <Stack
                    key={id}
                    direction="row"
                    alignItems="flex-start"
                    gap="12px"
                    sx={{
                      backgroundColor: palette.background.main,
                      px: "16px",
                      py: "8px",
                      borderTop: `1px solid ${palette.border.dark}`,
                    }}
                  >
                    <Box
                      sx={{
                        mt: "6px",
                        width: "10px",
                        height: "10px",
                        borderRadius: "999px",
                        backgroundColor: dd.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography sx={{ flex: 1, fontSize: "13px", color: palette.text.tertiary }}>
                      {INDICATOR_LABELS[id] ?? id}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "12px",
                        fontWeight: 500,
                        color: palette.text.tertiary,
                        flexShrink: 0,
                      }}
                    >
                      {dd.label}
                    </Typography>
                  </Stack>
                );
              })}
            </Box>
          );
        })}
      </Box>
      <Stack direction="row" flexWrap="wrap" gap="16px" sx={{ mt: "12px" }}>
        {(
          [
            ["#13715B", "Disclosed"],
            ["#C8941E", "Partial"],
            [palette.border.dark, "Silent"],
            ["#B23B3B", "Adverse"],
            ["#98A2B3", "Not applicable"],
          ] as [string, string][]
        ).map(([c, l]) => (
          <Stack key={l} direction="row" alignItems="center" gap="6px">
            <Box
              sx={{ width: "10px", height: "10px", borderRadius: "999px", backgroundColor: c }}
            />
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>{l}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
