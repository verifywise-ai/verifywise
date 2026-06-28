/**
 * @fileoverview Regulations Tracker — Horizon (changelog) tab.
 *
 * A curated, dated changelog of AI-regulation changes across all countries,
 * mirrored from the public feed. Read-only.
 *
 * @module pages/RegulationsTracker/Horizon
 */

import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import { AlertTriangle, History } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import Chip from "../../../components/Chip";
import { palette } from "../../../themes/palette";
import { useHorizon } from "../../../../application/hooks/useRegulationsTracker";

interface HorizonChange {
  date: string;
  countrySlug: string;
  countryName: string;
  countryFlag?: string;
  type?: string;
  description: string;
  detail?: string | null;
}

export default function Horizon() {
  const { data, isLoading, isError } = useHorizon();
  const items: HorizonChange[] = Array.isArray(data?.data?.items) ? data.data.items : [];
  const stale = data?.data?.stale === true;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <PageHeaderExtended
      title="Horizon"
      description="A dated changelog of AI-regulation changes across all tracked jurisdictions, newest first."
      helpArticlePath="regulations-tracker/horizon"
    >
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: "48px" }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          message="We couldn't load the regulation changelog right now. Please try again later."
          showBorder
        />
      )}

      {isEmpty && !isError && (
        <EmptyState
          icon={History}
          message="No regulation changes have been recorded yet."
          showBorder
        />
      )}

      {!isLoading && !isError && items.length > 0 && (
        <Stack gap="8px">
          {stale && (
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mb: "4px" }}>
              Showing the last known changelog; live data is temporarily unavailable.
            </Typography>
          )}
          {items.map((c, i) => (
            <Box
              key={`${c.countrySlug}-${c.date}-${i}`}
              sx={{
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                p: "12px",
                backgroundColor: palette.background.main,
              }}
            >
              <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                {c.countryFlag && (
                  <Box component="span" aria-hidden sx={{ fontSize: "16px", lineHeight: 1 }}>
                    {c.countryFlag}
                  </Box>
                )}
                <Typography sx={{ fontSize: "14px", fontWeight: 600 }}>{c.countryName}</Typography>
                {c.type && <Chip label={c.type} variant="info" uppercase={false} />}
                <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, ml: "auto" }}>
                  {c.date}
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: "13px", color: palette.text.primary, mt: "6px", lineHeight: 1.5 }}
              >
                {c.description}
              </Typography>
              {c.detail && (
                <Typography
                  sx={{
                    fontSize: "13px",
                    color: palette.text.tertiary,
                    mt: "4px",
                    lineHeight: 1.5,
                  }}
                >
                  {c.detail}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </PageHeaderExtended>
  );
}
