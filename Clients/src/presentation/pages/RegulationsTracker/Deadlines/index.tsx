/**
 * @fileoverview Regulations Tracker — Deadlines tab.
 *
 * Forward-looking effective-date milestones for AI regulations, plus regulations
 * whose effective date is not yet scheduled. Mirrored from the public feed.
 * Read-only.
 *
 * @module pages/RegulationsTracker/Deadlines
 */

import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import Chip from "../../../components/Chip";
import { palette } from "../../../themes/palette";
import { useDeadlines } from "../../../../application/hooks/useRegulationsTracker";

interface Deadline {
  effectiveDateISO: string;
  effectiveDateRaw?: string;
  dateConfidence?: string;
  countrySlug: string;
  countryName: string;
  regulationName: string;
  status?: string;
  type?: string;
  sourceUrl?: string;
}

interface Unscheduled {
  countrySlug: string;
  countryName: string;
  regulationName: string;
  effectiveDateRaw?: string;
  status?: string;
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        border: `1px solid ${palette.border.dark}`,
        borderRadius: "4px",
        p: "12px",
        backgroundColor: palette.background.main,
      }}
    >
      {children}
    </Box>
  );
}

export default function Deadlines() {
  const { data, isLoading, isError } = useDeadlines();
  const deadlines: Deadline[] = Array.isArray(data?.data?.deadlines) ? data.data.deadlines : [];
  const unscheduled: Unscheduled[] = Array.isArray(data?.data?.unscheduled)
    ? data.data.unscheduled
    : [];
  const stale = data?.data?.stale === true;
  const isEmpty = !isLoading && deadlines.length === 0 && unscheduled.length === 0;

  return (
    <PageHeaderExtended
      title="Deadlines"
      description="Upcoming effective-date milestones for AI regulations, soonest first, plus regulations with no scheduled date yet."
      helpArticlePath="regulations-tracker/deadlines"
    >
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: "48px" }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          message="We couldn't load regulation deadlines right now. Please try again later."
          showBorder
        />
      )}

      {isEmpty && !isError && (
        <EmptyState
          icon={CalendarClock}
          message="No upcoming regulation deadlines are recorded yet."
          showBorder
        />
      )}

      {!isLoading && !isError && !isEmpty && (
        <Stack gap="16px">
          {stale && (
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
              Showing the last known deadlines; live data is temporarily unavailable.
            </Typography>
          )}

          {deadlines.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: "8px" }}>
                Scheduled
              </Typography>
              <Stack gap="8px">
                {deadlines.map((d, i) => (
                  <Row key={`${d.countrySlug}-${d.regulationName}-${i}`}>
                    <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                      <Typography
                        sx={{ fontSize: "13px", fontWeight: 600, color: palette.brand.primary }}
                      >
                        {d.effectiveDateRaw || d.effectiveDateISO}
                      </Typography>
                      {d.status && <Chip label={d.status} variant="default" uppercase={false} />}
                      <Typography
                        sx={{ fontSize: "12px", color: palette.text.tertiary, ml: "auto" }}
                      >
                        {d.countryName}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: "14px", fontWeight: 500, mt: "4px" }}>
                      {d.regulationName}
                    </Typography>
                    {d.sourceUrl && (
                      <Box sx={{ mt: "6px" }}>
                        <a
                          href={d.sourceUrl}
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
                  </Row>
                ))}
              </Stack>
            </Box>
          )}

          {unscheduled.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: "8px" }}>
                Not yet scheduled
              </Typography>
              <Stack gap="8px">
                {unscheduled.map((u, i) => (
                  <Row key={`${u.countrySlug}-${u.regulationName}-${i}`}>
                    <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                        {u.effectiveDateRaw || "Date TBD"}
                      </Typography>
                      {u.status && <Chip label={u.status} variant="default" uppercase={false} />}
                      <Typography
                        sx={{ fontSize: "12px", color: palette.text.tertiary, ml: "auto" }}
                      >
                        {u.countryName}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: "14px", fontWeight: 500, mt: "4px" }}>
                      {u.regulationName}
                    </Typography>
                  </Row>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
    </PageHeaderExtended>
  );
}
