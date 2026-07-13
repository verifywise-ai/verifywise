// Derived insight blocks for the AI Trust Index app detail page. Ported from the
// public website (components/ai-trust-index/app-insights.tsx). All blocks derive
// from data the record already holds (+ the full app list passed in); no fetching.
import { useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { TrustIndexAppData } from "../shared";
import { faviconUrl } from "../shared";
import { INDICATOR_GAP_LABELS, type IndicatorMap } from "../rubric";
import { palette } from "../../../themes/palette";

/**
 * Favicon for a related app that falls back to the app's initial when the icon
 * service has no entry (some domains 404 on the favicon CDN), matching the
 * fallback used on the cards and the detail header.
 */
function RelatedAppIcon({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (domain && !failed) {
    return (
      <img
        src={faviconUrl(domain)}
        alt={name}
        width={20}
        height={20}
        onError={() => setFailed(true)}
        style={{ display: "block" }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: 20,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        fontWeight: 600,
        color: palette.text.tertiary,
      }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </Box>
  );
}

const VERDICT_QUALITY: Record<string, string> = {
  A: "discloses its data practices clearly",
  B: "discloses most of its data practices",
  C: "discloses its data practices only in part",
  D: "leaves much about its data practices unstated",
  F: "discloses little about its data practices",
};

function gradeArticle(g: string): string {
  return g === "A" || g === "F" ? "an" : "a";
}

export function VerdictLine({ app }: { app: TrustIndexAppData }) {
  const theme = useTheme();
  const g = app.displayedGrade;
  return (
    <Typography
      sx={{ fontSize: "15px", lineHeight: 1.6, color: theme.palette.text.secondary, mt: "16px" }}
    >
      {app.name} earns{" "}
      <Box component="span" sx={{ fontWeight: 600, color: palette.brand.primary }}>
        {gradeArticle(g)} {g} ({app.scoreOutOf100}/100)
      </Box>{" "}
      because it {VERDICT_QUALITY[g] ?? "discloses its data practices"}.
    </Typography>
  );
}

function deriveWatchOuts(indicators: IndicatorMap): string[] {
  const order = (a: string) => (a === "zero" ? 0 : a === "half" ? 1 : 2);
  return Object.entries(indicators)
    .filter(([, a]) => (a.award === "zero" || a.award === "half") && a.subFlag !== "NA")
    .sort(([, a], [, b]) => order(a.award) - order(b.award))
    .slice(0, 4)
    .map(([id, a]) => {
      const topic = INDICATOR_GAP_LABELS[id] ?? id;
      return a.award === "half" ? `Only partial: ${topic}` : `Not stated: ${topic}`;
    });
}

export function WatchOuts({ indicators }: { indicators?: IndicatorMap | null }) {
  const items = indicators ? deriveWatchOuts(indicators) : [];
  if (items.length === 0) return null;
  return (
    <Box
      sx={{
        border: `1px solid ${palette.border.dark}`,
        borderRadius: "4px",
        p: "16px",
        backgroundColor: palette.background.accent,
      }}
    >
      <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: "12px" }}>
        What the policy is silent or vague on
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
          gap: "8px",
        }}
      >
        {items.map((w, i) => (
          <Typography
            key={i}
            sx={{ fontSize: "13px", color: palette.text.tertiary, lineHeight: 1.5 }}
          >
            • {w}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export function ComparisonStrip({
  app,
  allApps,
}: {
  app: TrustIndexAppData;
  allApps: TrustIndexAppData[];
}) {
  const theme = useTheme();
  const ranked = [...allApps].sort((a, b) => b.scoreOutOf100 - a.scoreOutOf100);
  const rank = ranked.findIndex((a) => a.slug === app.slug) + 1;
  const total = ranked.length;
  const peers = allApps.filter((a) => a.category === app.category && a.slug !== app.slug);
  const peerAvg =
    peers.length >= 2
      ? Math.round(peers.reduce((s, a) => s + a.scoreOutOf100, 0) / peers.length)
      : null;
  const vsAvg = peerAvg !== null ? app.scoreOutOf100 - peerAvg : null;

  const Cell = ({ value, label, accent }: { value: string; label: string; accent?: string }) => (
    <Box sx={{ flex: 1, textAlign: "center", p: "12px" }}>
      <Typography
        sx={{ fontSize: "20px", fontWeight: 700, color: accent ?? theme.palette.text.primary }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mt: "2px" }}>
        {label}
      </Typography>
    </Box>
  );

  return (
    <Stack
      direction="row"
      sx={{ border: `1px solid ${palette.border.dark}`, borderRadius: "4px", overflow: "hidden" }}
    >
      <Cell value={`#${rank}`} label={`of ${total} apps ranked`} />
      <Box sx={{ width: "1px", backgroundColor: palette.border.dark }} />
      <Cell
        value={`${app.scoreOutOf100}`}
        label={`score · ${app.category} avg ${peerAvg ?? "—"}`}
      />
      <Box sx={{ width: "1px", backgroundColor: palette.border.dark }} />
      <Cell
        value={vsAvg === null ? "—" : `${vsAvg >= 0 ? "+" : ""}${vsAvg}`}
        label="vs category average"
        accent={vsAvg !== null ? (vsAvg >= 0 ? palette.brand.primary : "#C2683B") : undefined}
      />
    </Stack>
  );
}

export function RelatedApps({
  app,
  allApps,
}: {
  app: TrustIndexAppData;
  allApps: TrustIndexAppData[];
}) {
  const related = allApps
    .filter((a) => a.category === app.category && a.slug !== app.slug)
    .sort((a, b) => b.scoreOutOf100 - a.scoreOutOf100)
    .slice(0, 4);
  if (related.length === 0) return null;
  return (
    <Box>
      <Typography
        sx={{ fontSize: "15px", fontWeight: 600, mb: "12px", color: palette.text.tertiary }}
      >
        Other {app.category.toLowerCase()} apps
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
          gap: "8px",
        }}
      >
        {related.map((a) => (
          <RouterLink
            key={a.slug}
            to={`/ai-trust-index/${a.slug}`}
            style={{ textDecoration: "none" }}
          >
            <Stack
              direction="row"
              alignItems="center"
              gap="8px"
              sx={{
                "border": `1px solid ${palette.border.dark}`,
                "borderRadius": "4px",
                "p": "8px",
                "backgroundColor": palette.background.main,
                "&:hover": { backgroundColor: palette.background.accent },
              }}
            >
              <RelatedAppIcon domain={a.domain} name={a.name} />
              <Typography
                sx={{ flex: 1, fontSize: "13px", fontWeight: 500, color: palette.text.tertiary }}
              >
                {a.name}
              </Typography>
              <Typography sx={{ fontSize: "12px", fontWeight: 700, color: palette.text.tertiary }}>
                {a.displayedGrade}
              </Typography>
            </Stack>
          </RouterLink>
        ))}
      </Box>
    </Box>
  );
}
