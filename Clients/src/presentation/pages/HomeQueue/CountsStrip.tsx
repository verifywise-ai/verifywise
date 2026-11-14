import { Box, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import type { HomeQueueCountId, HomeQueueResponse } from "../../../domain/types/homeQueue.types";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { background, border, radiusPx, text } from "../../themes/palette";

type CountPart = "record" | "track" | "enforce";

interface CountDefinition {
  id: HomeQueueCountId;
  label: string;
  path: string;
}

/** Org-wide counts by part; each opens its module. Labels are dictionary keys. */
const COUNT_GROUPS: { part: CountPart; heading: string; counts: CountDefinition[] }[] = [
  {
    part: "record",
    heading: "Record",
    counts: [
      { id: "intakeWaiting", label: "Intake waiting", path: "/intake-forms/submissions" },
      { id: "agentsToReview", label: "Agents to review", path: "/agent-discovery" },
      { id: "aiOnRecord", label: "AI on the record", path: "/overview" },
    ],
  },
  {
    part: "track",
    heading: "Track",
    counts: [
      { id: "untreatedRisks", label: "Untreated risks", path: "/risk-management" },
      { id: "vendorReviewsDue", label: "Vendor reviews due", path: "/vendors" },
    ],
  },
  {
    part: "enforce",
    heading: "Enforce",
    counts: [
      { id: "policyReviewsDue", label: "Policy reviews due", path: "/policies" },
      {
        id: "promptsBlockedMasked24h",
        label: "Prompts blocked or masked (last 24 hours)",
        path: "/ai-gateway/guardrails",
      },
    ],
  },
];

interface CountsStripProps {
  counts: HomeQueueResponse["counts"];
}

/**
 * The counts strip under the queue. A count missing from the response is one
 * the user may not see and is left out; a null count failed to load and
 * shows a dash, never a zero. A part with no visible count is left out.
 */
const CountsStrip = ({ counts }: CountsStripProps) => {
  const { t } = useTranslation();

  const groups = COUNT_GROUPS.map((group) => ({
    ...group,
    counts: group.counts.filter((count) => Object.prototype.hasOwnProperty.call(counts, count.id)),
  })).filter((group) => group.counts.length > 0);

  if (groups.length === 0) return null;

  return (
    <Box
      data-testid="home-counts-strip"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
        gap: "16px",
      }}
    >
      {groups.map((group) => (
        <Box
          key={group.part}
          sx={{
            border: `1px solid ${border.dark}`,
            borderRadius: radiusPx.sm,
            backgroundColor: background.main,
            padding: "12px 16px",
          }}
        >
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 600,
              color: text.secondary,
              marginBottom: "4px",
            }}
          >
            {t(group.heading)}
          </Typography>
          <Stack>
            {group.counts.map((count) => {
              const value = counts[count.id];
              return (
                <Box key={count.id} data-testid={`home-count-${count.id}`}>
                  <Stack
                    component={RouterLink}
                    to={count.path}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="baseline"
                    sx={{
                      "gap": "12px",
                      "padding": "6px 0",
                      "textDecoration": "none",
                      "color": text.secondary,
                      "&:hover .home-count-label": { textDecoration: "underline" },
                    }}
                  >
                    <Typography className="home-count-label" sx={{ fontSize: "13px" }}>
                      {t(count.label)}
                    </Typography>
                    <Typography
                      sx={{ fontSize: "13px", fontWeight: 600, color: text.primary }}
                      title={value === null ? t("Couldn't be loaded") : undefined}
                    >
                      {value === null || value === undefined ? "—" : value}
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Box>
  );
};

export default CountsStrip;
