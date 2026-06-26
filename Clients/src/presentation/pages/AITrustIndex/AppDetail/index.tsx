/**
 * @fileoverview AI Trust Index — App detail.
 *
 * Full assessment view for a single app: header (favicon, vendor, grade,
 * score meter, track toggle), verdict, comparison strip, grade scale,
 * summary, highlights, dealbreaker flags, watch-outs, score breakdown,
 * policy metadata and related apps. Handles removed-from-index and
 * not-found states.
 *
 * @module pages/AITrustIndex/AppDetail
 */

import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Stack, Typography, CircularProgress, useTheme } from "@mui/material";
import { ArrowLeft, Gauge, SearchX } from "lucide-react";
import { PageBreadcrumbs } from "../../../components/breadcrumbs/PageBreadcrumbs";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link/VWLink";
import { palette } from "../../../themes/palette";
import {
  useApp,
  useApps,
  useTrackApp,
  useUntrackApp,
} from "../../../../application/hooks/useAiTrustIndex";
import { useAITrustIndexSidebarContextSafe } from "../../../../application/contexts/AITrustIndexSidebar.context";
import { gradeVariant, TrustIndexAppData, faviconUrl } from "../shared";
import { VerdictLine, WatchOuts, ComparisonStrip, RelatedApps } from "./insights";
import { useTrustIndexAlert } from "../useTrustIndexAlert";
import { ScoreBreakdown } from "./ScoreBreakdown";

interface AppDetailRow {
  slug: string;
  name: string;
  vendor?: string;
  category?: string;
  letter_grade?: string;
  score_out_of_100?: number;
  is_tracked?: boolean;
  no_longer_in_index?: boolean;
  data: TrustIndexAppData;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        border: `1px solid ${palette.border.dark}`,
        borderRadius: "4px",
        backgroundColor: palette.background.main,
        p: "16px",
      }}
    >
      <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: "12px" }}>{title}</Typography>
      {children}
    </Box>
  );
}

export default function AppDetail() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { slug = "" } = useParams();
  const sidebar = useAITrustIndexSidebarContextSafe();

  const { data, isLoading, isError } = useApp(slug);
  // Fetch the full catalog (not just a page) so the comparison strip can compute
  // an accurate rank "of N" and a true category average. The backend caps
  // pageSize, so this asks for the whole set in one page.
  const { data: appsData } = useApps({ page: 1, pageSize: 1000 });
  const trackApp = useTrackApp();
  const untrackApp = useUntrackApp();
  const { showError, AlertSlot } = useTrustIndexAlert();

  const [imgFailed, setImgFailed] = useState(false);

  const app: AppDetailRow | null = useMemo(() => (data?.data ? data.data : null), [data]);
  const detail: TrustIndexAppData | undefined = app?.data;

  const allApps = useMemo(
    () => (appsData?.data?.apps ?? []).map((r: any) => r.data as TrustIndexAppData).filter(Boolean),
    [appsData],
  );

  const handleToggleTrack = useCallback(() => {
    if (!app) return;
    const onDone = () => sidebar?.refreshTrackedCount();
    if (app.is_tracked) {
      untrackApp.mutate(app.slug, {
        onSuccess: onDone,
        onError: () => showError(`We couldn't untrack ${app.name}. Please try again.`),
      });
    } else {
      trackApp.mutate(app.slug, {
        onSuccess: onDone,
        onError: () => showError(`We couldn't track ${app.name}. Please try again.`),
      });
    }
  }, [app, trackApp, untrackApp, sidebar, showError]);

  const breadcrumbItems = [
    {
      label: "AI Trust Index",
      path: "/ai-trust-index/browse",
      icon: <Gauge size={14} strokeWidth={1.5} />,
    },
    { label: app?.name || "App", path: "" },
  ];

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
      </Box>
    );
  }

  if (isError || !app) {
    return (
      <Box>
        <PageBreadcrumbs
          items={[
            {
              label: "AI Trust Index",
              path: "/ai-trust-index/browse",
              icon: <Gauge size={14} strokeWidth={1.5} />,
            },
          ]}
          autoGenerate={false}
          testId="ai-trust-index-detail-breadcrumbs"
        />
        <EmptyState
          icon={SearchX}
          message="We couldn't find this app in the AI Trust Index."
          showBorder
        />
        <Box sx={{ display: "flex", justifyContent: "center", mt: "16px" }}>
          <CustomizableButton
            text="Back to Browse"
            onClick={() => navigate("/ai-trust-index/browse")}
            sx={{ height: 34 }}
          />
        </Box>
      </Box>
    );
  }

  const displayedGrade = detail?.displayedGrade || app.letter_grade || "";
  const initial = (app.name || "?").charAt(0).toUpperCase();

  return (
    <Box>
      {AlertSlot}
      <PageBreadcrumbs
        items={breadcrumbItems}
        autoGenerate={false}
        testId="ai-trust-index-detail-breadcrumbs"
      />

      <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
        <CustomizableButton
          text="Back to Browse"
          onClick={() => navigate("/ai-trust-index/browse")}
          variant="text"
          startIcon={<ArrowLeft size={16} />}
          sx={{ mb: "8px" }}
        />
      </Box>

      {/* Header */}
      <Stack direction="row" alignItems="flex-start" gap="16px" sx={{ mb: "24px" }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: "8px",
            border: `1px solid ${palette.border.dark}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            backgroundColor: palette.background.accent,
            overflow: "hidden",
          }}
        >
          {detail?.domain && !imgFailed ? (
            <img
              src={faviconUrl(detail.domain)}
              alt={app.name}
              width={28}
              height={28}
              onError={() => setImgFailed(true)}
              style={{ display: "block" }}
            />
          ) : (
            <Typography sx={{ fontSize: "20px", fontWeight: 600, color: palette.text.tertiary }}>
              {initial}
            </Typography>
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
            <Typography sx={{ fontSize: "20px", fontWeight: 600 }}>{app.name}</Typography>
            {displayedGrade && (
              <Chip label={displayedGrade} variant={gradeVariant(displayedGrade)} />
            )}
            {app.no_longer_in_index && (
              <Chip label="No longer in index" variant="warning" uppercase={false} />
            )}
          </Stack>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: "4px" }}>
            {[app.vendor, app.category].filter(Boolean).join(" · ")}
            {detail?.confidence && (
              <Box component="span" sx={{ color: palette.text.muted }}>
                {" · "}
                {detail.confidence.toLowerCase()} confidence
              </Box>
            )}
          </Typography>

          {/* Score meter bar */}
          {detail && detail.scoreOutOf100 != null && (
            <Box sx={{ mt: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Box
                sx={{
                  flex: 1,
                  height: "8px",
                  borderRadius: "999px",
                  backgroundColor: "#E5E7EB",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    height: "100%",
                    width: `${detail.scoreOutOf100}%`,
                    backgroundColor: palette.brand.primary,
                    borderRadius: "999px",
                  }}
                />
              </Box>
              <Typography
                sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.secondary }}
              >
                {detail.scoreOutOf100}
                <Box component="span" sx={{ color: palette.text.tertiary }}>
                  /100
                </Box>
              </Typography>
            </Box>
          )}
        </Box>

        <CustomizableButton
          text={app.is_tracked ? "Untrack" : "Track"}
          variant={app.is_tracked ? "outlined" : "contained"}
          onClick={handleToggleTrack}
          isDisabled={trackApp.isPending || untrackApp.isPending}
          // Fixed width so toggling the label "Track" ⇄ "Untrack" doesn't reflow
          // the header row (which would nudge the score meter beside it).
          sx={{ height: 34, minWidth: 96, flexShrink: 0 }}
        />
      </Stack>

      <Stack gap="16px">
        {/* Verdict */}
        {detail && <VerdictLine app={detail} />}

        {/* Capped assessment note */}
        {app.no_longer_in_index && (
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, fontStyle: "italic" }}>
            This app is no longer in the AI Trust Index. The assessment below reflects its last
            scored version.
          </Typography>
        )}

        {/* Dealbreaker flags */}
        {detail?.dealbreakerFlags && detail.dealbreakerFlags.length > 0 && (
          <SectionCard title="Dealbreaker flags">
            <Stack gap="8px">
              {detail.dealbreakerFlags.map((flag, i) => (
                <Box
                  key={`${flag}-${i}`}
                  sx={{
                    // Dealbreaker flags are full sentences (quoted clauses), not
                    // short labels, so they render as wrapping blocks rather than
                    // single-line chips that overflow off the card.
                    backgroundColor: "#FFD6D6",
                    border: "1px solid #F5B8B8",
                    borderRadius: "4px",
                    color: "#D32F2F",
                    fontSize: "13px",
                    lineHeight: 1.5,
                    p: "8px 12px",
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                  }}
                >
                  {flag}
                </Box>
              ))}
            </Stack>
          </SectionCard>
        )}

        {/* Comparison strip — only once the full catalog has loaded, so it never
            flashes "#0 of 0" / "—" while allApps is still empty. */}
        {detail && allApps.length > 0 && <ComparisonStrip app={detail} allApps={allApps} />}

        {/* Grade scale */}
        {detail && (
          <Stack direction="row" flexWrap="wrap" gap="8px" alignItems="center" sx={{ mt: "16px" }}>
            <Typography
              sx={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: palette.text.tertiary,
              }}
            >
              Grade scale
            </Typography>
            {(["A", "B", "C", "D", "F"] as const).map((g) => {
              const isActive = g === detail.displayedGrade;
              return (
                <Box
                  key={g}
                  sx={
                    isActive
                      ? {
                          // Mark the app's own band with a solid ring instead of
                          // dimming the others (dimming made the pastel chips
                          // unreadable). All bands stay full-contrast.
                          // A border (not an outline) hugs the chip flush with no
                          // gap; radius matches the chip's 4px corners so it stays
                          // squarish instead of bulging into an ellipse.
                          display: "inline-flex",
                          borderRadius: "4px",
                          border: `2px solid ${palette.text.primary}`,
                        }
                      : undefined
                  }
                >
                  <Chip
                    label={`${g} · ${{ A: "70–100", B: "60–69", C: "48–59", D: "35–47", F: "0–34" }[g]}`}
                    variant={gradeVariant(g)}
                    uppercase={false}
                  />
                </Box>
              );
            })}
          </Stack>
        )}

        {/* Summary */}
        {detail?.summary && (
          <SectionCard title="Summary">
            <Typography
              sx={{ fontSize: "15px", color: theme.palette.text.secondary, lineHeight: 1.7 }}
            >
              {detail.summary}
            </Typography>
          </SectionCard>
        )}

        {/* Highlights */}
        {detail?.highlights && detail.highlights.length > 0 && (
          <SectionCard title="Highlights">
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
                gap: "12px",
              }}
            >
              {detail.highlights.map((h, i) => (
                <Box
                  key={`${h.label}-${i}`}
                  sx={{
                    border: `1px solid ${palette.border.light}`,
                    borderRadius: "4px",
                    p: "12px",
                    backgroundColor: palette.background.accent,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: palette.text.tertiary,
                      mb: "4px",
                    }}
                  >
                    {h.label}
                  </Typography>
                  <Typography
                    sx={{ fontSize: "13px", color: theme.palette.text.secondary, lineHeight: 1.5 }}
                  >
                    {h.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </SectionCard>
        )}

        {/* Watch-outs */}
        {detail && <WatchOuts indicators={detail.indicators} />}

        {/* Score breakdown or fallback */}
        {detail &&
          (detail.indicators && Object.keys(detail.indicators).length > 0 ? (
            <ScoreBreakdown indicators={detail.indicators} appName={app.name} />
          ) : (
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: "8px" }}>
              The area-by-area breakdown for {app.name} is being prepared and will appear after its
              next scoring pass. The summary and highlights above reflect the latest assessment.
            </Typography>
          ))}

        {/* Policy details */}
        {detail && (
          <SectionCard title="Policy details">
            <Stack gap="8px">
              {detail.policyUrl && (
                <Stack direction="row" alignItems="center" gap="8px">
                  <Typography
                    sx={{ fontSize: "13px", color: palette.text.tertiary, minWidth: 140 }}
                  >
                    Privacy policy
                  </Typography>
                  <VWLink
                    url={detail.policyUrl}
                    openInNewTab
                    showUnderline={false}
                    sx={{ fontSize: "13px" }}
                  >
                    View policy
                  </VWLink>
                </Stack>
              )}
              <Stack direction="row" alignItems="center" gap="8px">
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, minWidth: 140 }}>
                  Policy last updated
                </Typography>
                <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
                  {detail.policyLastUpdated || "Unknown"}
                </Typography>
              </Stack>
              {detail.modalities && detail.modalities.length > 0 && (
                <Stack direction="row" alignItems="center" gap="8px">
                  <Typography
                    sx={{ fontSize: "13px", color: palette.text.tertiary, minWidth: 140 }}
                  >
                    Modalities
                  </Typography>
                  <Stack direction="row" gap="6px" flexWrap="wrap">
                    {detail.modalities.map((m, i) => (
                      <Chip key={`${m}-${i}`} label={m} variant="default" uppercase={false} />
                    ))}
                  </Stack>
                </Stack>
              )}
              <Stack direction="row" alignItems="center" gap="8px">
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, minWidth: 140 }}>
                  Processes biometrics
                </Typography>
                <Chip
                  label={detail.processesBiometrics ? "Yes" : "No"}
                  variant={detail.processesBiometrics ? "warning" : "success"}
                  uppercase={false}
                />
              </Stack>
            </Stack>
          </SectionCard>
        )}

        {/* Related apps */}
        {detail && allApps.length > 0 && <RelatedApps app={detail} allApps={allApps} />}
      </Stack>
    </Box>
  );
}
