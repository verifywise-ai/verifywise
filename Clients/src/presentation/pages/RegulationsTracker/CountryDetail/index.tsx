/**
 * @fileoverview Regulations Tracker — Country detail.
 *
 * Full view for a single country/jurisdiction: header (name, region, track
 * toggle), regulations list, timeline, change history, and feed disclaimer.
 *
 * The feed disclaimer text is rendered VERBATIM from the API payload
 * (meta.disclaimer / scopeStatement). It is never paraphrased or translated —
 * only the UI chrome around it is in the app language.
 *
 * A "stale" indicator is shown when the payload includes stale: true.
 *
 * @module pages/RegulationsTracker/CountryDetail
 */

import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Stack, Typography, CircularProgress, useTheme } from "@mui/material";
import { ArrowLeft, Globe, SearchX, AlertTriangle, Clock } from "lucide-react";
import { PageBreadcrumbs } from "../../../components/breadcrumbs/PageBreadcrumbs";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import Chip from "../../../components/Chip";
import { palette } from "../../../themes/palette";
import {
  useCountryDetail,
  useTrackCountry,
  useUntrackCountry,
} from "../../../../application/hooks/useRegulationsTracker";
import { useRegulationsTrackerSidebarContextSafe } from "../../../../application/contexts/RegulationsTrackerSidebar.context";
import { useTrackerAlert } from "../useTrackerAlert";

interface Regulation {
  id?: string | number;
  name: string;
  status?: string;
  effective_date?: string;
  description?: string;
  url?: string;
}

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
}

interface ChangeHistoryEntry {
  date: string;
  summary: string;
  type?: string;
}

interface CountryDetailMeta {
  disclaimer?: string;
  scopeStatement?: string;
  last_updated?: string;
  source?: string;
}

interface CountryDetailData {
  slug: string;
  name: string;
  region?: string;
  iso2?: string;
  is_tracked?: boolean;
  stale?: boolean;
  regulations?: Regulation[];
  timeline?: TimelineEvent[];
  change_history?: ChangeHistoryEntry[];
  meta?: CountryDetailMeta;
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

export default function CountryDetail() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { slug = "" } = useParams();
  const sidebar = useRegulationsTrackerSidebarContextSafe();

  const { data, isLoading, isError } = useCountryDetail(slug);
  const trackCountry = useTrackCountry();
  const untrackCountry = useUntrackCountry();
  const { showError, AlertSlot } = useTrackerAlert();

  const country: CountryDetailData | null = data?.data ?? null;

  const handleToggleTrack = useCallback(() => {
    if (!country) return;
    const onDone = () => sidebar?.refreshTrackedCount();
    if (country.is_tracked) {
      untrackCountry.mutate(country.slug, {
        onSuccess: onDone,
        onError: () => showError(`We couldn't untrack ${country.name}. Please try again.`),
      });
    } else {
      trackCountry.mutate(country.slug, {
        onSuccess: onDone,
        onError: () => showError(`We couldn't track ${country.name}. Please try again.`),
      });
    }
  }, [country, trackCountry, untrackCountry, sidebar, showError]);

  const breadcrumbItems = [
    {
      label: "Regulations tracker",
      path: "/regulations-tracker/browse",
      icon: <Globe size={14} strokeWidth={1.5} />,
    },
    { label: country?.name || "Country", path: "" },
  ];

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
      </Box>
    );
  }

  if (isError || !country) {
    return (
      <Box>
        <PageBreadcrumbs
          items={[
            {
              label: "Regulations tracker",
              path: "/regulations-tracker/browse",
              icon: <Globe size={14} strokeWidth={1.5} />,
            },
          ]}
          autoGenerate={false}
          testId="regulations-tracker-detail-breadcrumbs"
        />
        <EmptyState
          icon={SearchX}
          message="We couldn't find this country in the regulations catalogue."
          showBorder
        />
        <Box sx={{ display: "flex", justifyContent: "center", mt: "16px" }}>
          <CustomizableButton
            text="Back to browse"
            onClick={() => navigate("/regulations-tracker/browse")}
            sx={{ height: 34 }}
          />
        </Box>
      </Box>
    );
  }

  const disclaimer = country.meta?.disclaimer || country.meta?.scopeStatement;

  return (
    <Box>
      {AlertSlot}
      <PageBreadcrumbs
        items={breadcrumbItems}
        autoGenerate={false}
        testId="regulations-tracker-detail-breadcrumbs"
      />

      <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
        <CustomizableButton
          text="Back to browse"
          onClick={() => navigate("/regulations-tracker/browse")}
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
          }}
        >
          <Globe size={24} strokeWidth={1.5} color={palette.text.tertiary} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
            <Typography sx={{ fontSize: "20px", fontWeight: 600 }}>{country.name}</Typography>
            {country.stale && (
              <Chip label="Data may be outdated" variant="warning" uppercase={false} />
            )}
          </Stack>
          <Stack direction="row" alignItems="center" gap="6px" sx={{ mt: "4px" }}>
            {country.region && (
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {country.region}
              </Typography>
            )}
            {country.iso2 && (
              <Typography sx={{ fontSize: "13px", color: palette.text.muted }}>
                · {country.iso2}
              </Typography>
            )}
          </Stack>
          {country.meta?.last_updated && (
            <Stack direction="row" alignItems="center" gap="4px" sx={{ mt: "4px" }}>
              <Clock size={12} strokeWidth={1.5} color={palette.text.tertiary} />
              <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                Last updated: {country.meta.last_updated}
              </Typography>
            </Stack>
          )}
        </Box>

        <CustomizableButton
          text={country.is_tracked ? "Untrack" : "Track"}
          variant={country.is_tracked ? "outlined" : "contained"}
          onClick={handleToggleTrack}
          isDisabled={trackCountry.isPending || untrackCountry.isPending}
          sx={{ height: 34, minWidth: 96, flexShrink: 0 }}
        />
      </Stack>

      {/* Stale data warning banner */}
      {country.stale && (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
            backgroundColor: "#FFFBEA",
            p: "12px 16px",
            mb: "16px",
          }}
        >
          <AlertTriangle size={16} strokeWidth={1.5} color="#B45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography sx={{ fontSize: "13px", color: "#92400E", lineHeight: 1.5 }}>
            This data may be outdated. The feed has not been refreshed recently for this country.
            Information below reflects the last available snapshot.
          </Typography>
        </Box>
      )}

      <Stack gap="16px">
        {/* Regulations list */}
        {country.regulations && country.regulations.length > 0 && (
          <SectionCard title="Regulations">
            <Stack gap="12px">
              {country.regulations.map((reg, i) => (
                <Box
                  key={reg.id ?? `${reg.name}-${i}`}
                  sx={{
                    border: `1px solid ${palette.border.light}`,
                    borderRadius: "4px",
                    p: "12px",
                    backgroundColor: palette.background.accent,
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" gap="8px" flexWrap="wrap">
                    <Typography
                      sx={{ fontSize: "14px", fontWeight: 600, flex: 1, minWidth: 0 }}
                    >
                      {reg.name}
                    </Typography>
                    {reg.status && (
                      <Chip
                        label={reg.status}
                        variant={
                          reg.status.toLowerCase().includes("in force") ||
                          reg.status.toLowerCase().includes("active")
                            ? "success"
                            : reg.status.toLowerCase().includes("draft") ||
                                reg.status.toLowerCase().includes("proposed")
                              ? "warning"
                              : "default"
                        }
                        uppercase={false}
                      />
                    )}
                  </Stack>
                  {reg.effective_date && (
                    <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mt: "4px" }}>
                      Effective: {reg.effective_date}
                    </Typography>
                  )}
                  {reg.description && (
                    <Typography
                      sx={{
                        fontSize: "13px",
                        color: theme.palette.text.secondary,
                        mt: "8px",
                        lineHeight: 1.5,
                      }}
                    >
                      {reg.description}
                    </Typography>
                  )}
                  {reg.url && (
                    <Box sx={{ mt: "8px" }}>
                      <a
                        href={reg.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "13px",
                          color: palette.brand.primary,
                          textDecoration: "none",
                        }}
                      >
                        View source
                      </a>
                    </Box>
                  )}
                </Box>
              ))}
            </Stack>
          </SectionCard>
        )}

        {/* Timeline */}
        {country.timeline && country.timeline.length > 0 && (
          <SectionCard title="Timeline">
            <Stack gap="8px">
              {country.timeline.map((event, i) => (
                <Box
                  key={`${event.date}-${i}`}
                  sx={{ display: "flex", gap: "12px", alignItems: "flex-start" }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: palette.brand.primary,
                      flexShrink: 0,
                      mt: "5px",
                    }}
                  />
                  <Box>
                    <Stack direction="row" alignItems="center" gap="8px">
                      <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                        {event.date}
                      </Typography>
                      <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
                        {event.title}
                      </Typography>
                    </Stack>
                    {event.description && (
                      <Typography
                        sx={{
                          fontSize: "13px",
                          color: theme.palette.text.secondary,
                          mt: "2px",
                          lineHeight: 1.5,
                        }}
                      >
                        {event.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
          </SectionCard>
        )}

        {/* Change history */}
        {country.change_history && country.change_history.length > 0 && (
          <SectionCard title="Change history">
            <Stack gap="8px">
              {country.change_history.map((entry, i) => (
                <Box
                  key={`${entry.date}-${i}`}
                  sx={{
                    border: `1px solid ${palette.border.light}`,
                    borderRadius: "4px",
                    p: "10px 12px",
                    backgroundColor: palette.background.accent,
                  }}
                >
                  <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                    <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                      {entry.date}
                    </Typography>
                    {entry.type && (
                      <Chip label={entry.type} variant="info" uppercase={false} />
                    )}
                  </Stack>
                  <Typography
                    sx={{
                      fontSize: "13px",
                      color: theme.palette.text.secondary,
                      mt: "4px",
                      lineHeight: 1.5,
                    }}
                  >
                    {entry.summary}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </SectionCard>
        )}

        {/* Feed disclaimer — rendered VERBATIM from the feed payload, never paraphrased */}
        {disclaimer && (
          <Box
            sx={{
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              backgroundColor: palette.background.accent,
              p: "12px 16px",
            }}
          >
            <Typography
              sx={{
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: palette.text.tertiary,
                mb: "6px",
              }}
            >
              Disclaimer
            </Typography>
            {/* Verbatim feed content — do NOT translate or paraphrase */}
            <Typography
              sx={{ fontSize: "13px", color: palette.text.secondary, lineHeight: 1.6 }}
            >
              {disclaimer}
            </Typography>
          </Box>
        )}

        {/* Empty state when no regulations data yet */}
        {(!country.regulations || country.regulations.length === 0) &&
          (!country.timeline || country.timeline.length === 0) &&
          (!country.change_history || country.change_history.length === 0) && (
            <EmptyState
              icon={Globe}
              message="No regulation data is available for this country yet. Check back later as the feed is updated regularly."
              showBorder
            />
          )}
      </Stack>
    </Box>
  );
}
