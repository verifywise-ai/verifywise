/**
 * @fileoverview Regulations Tracker — Deadlines tab.
 *
 * Forward-looking effective-date milestones for AI regulations, plus regulations
 * whose effective date is not yet scheduled. Mirrored from the public feed.
 * Read-only.
 *
 * @module pages/RegulationsTracker/Deadlines
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import VWTooltip from "../../../components/VWTooltip";
import { palette } from "../../../themes/palette";
import { useDeadlines } from "../../../../application/hooks/useRegulationsTracker";
import { regulationStatusVariant } from "../statusVariant";

interface Deadline {
  effectiveDateISO: string;
  effectiveDateRaw?: string;
  dateConfidence?: string;
  countrySlug: string;
  countryName: string;
  countryFlag?: string;
  regulationName: string;
  status?: string;
  type?: string;
  sourceUrl?: string;
}

interface Unscheduled {
  countrySlug: string;
  countryName: string;
  countryFlag?: string;
  regulationName: string;
  effectiveDateRaw?: string;
  status?: string;
}

function Row({
  children,
  id,
  highlighted,
}: {
  children: React.ReactNode;
  id?: string;
  highlighted?: boolean;
}) {
  return (
    <Box
      id={id}
      sx={{
        border: highlighted
          ? `2px solid ${palette.brand.primary}`
          : `1px solid ${palette.border.dark}`,
        borderRadius: "4px",
        p: "12px",
        backgroundColor: palette.background.main,
        transition: "border-color 0.3s ease",
      }}
    >
      {children}
    </Box>
  );
}

/** Build the 12-month window starting from the current month.
 *  Returns an array of "YYYY-MM" strings.
 */
function buildMonthWindow(): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function MonthLabel({ yearMonth, isFirst }: { yearMonth: string; isFirst: boolean }) {
  const [yyyy, mm] = yearMonth.split("-");
  const monthIdx = parseInt(mm, 10) - 1;
  const label = SHORT_MONTH_NAMES[monthIdx];
  const showYear = isFirst || monthIdx === 0; // first column OR January

  return (
    <Box sx={{ textAlign: "center", pt: "4px" }}>
      <Typography component="span" sx={{ fontSize: "11px", color: palette.text.tertiary }}>
        {label}
      </Typography>
      {showYear && (
        <Typography component="span" sx={{ fontSize: "9px", color: palette.text.muted, ml: "2px" }}>
          '{String(yyyy).slice(2)}
        </Typography>
      )}
    </Box>
  );
}

interface RunwayProps {
  deadlines: Deadline[];
  onMarkerClick: (id: string) => void;
}

function RunwayCalendar({ deadlines, onMarkerClick }: RunwayProps) {
  const months = buildMonthWindow();
  const windowSet = new Set(months);

  // Bucket deadlines by YYYY-MM using safe substring parse (avoids TZ drift)
  const byMonth = new Map<string, Deadline[]>();
  for (const d of deadlines) {
    if (!d.effectiveDateISO) continue;
    const ym = d.effectiveDateISO.slice(0, 7); // "YYYY-MM"
    if (!windowSet.has(ym)) continue;
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(d);
  }

  const hasAnyInWindow = byMonth.size > 0;

  // Build a map from deadline object → its index in the `deadlines` array so
  // the runway markers use the exact same index as the Scheduled list rows
  // (`deadline-${countrySlug}-${i}`). This is done once here rather than
  // calling findIndex() per marker, which would return the FIRST match for
  // duplicate entries and jump to the wrong row.
  const markerIdxMap = new Map<Deadline, number>(deadlines.map((d, i) => [d, i]));

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const handleClick = useCallback(
    (d: Deadline, idx: number) => {
      const id = `deadline-${d.countrySlug}-${idx}`;
      onMarkerClick(id);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center",
        });
      }
    },
    [onMarkerClick, prefersReducedMotion],
  );

  return (
    <Box
      sx={{
        border: `1px solid ${palette.border.dark}`,
        borderRadius: "4px",
        backgroundColor: palette.background.main,
        p: "16px",
        mb: "8px",
      }}
    >
      <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: "4px" }}>Next 12 months</Typography>
      <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mb: "12px" }}>
        Effective dates for the coming year. Months closer to today are highlighted.
      </Typography>

      {!hasAnyInWindow && (
        <Typography
          sx={{
            fontSize: "12px",
            color: palette.text.muted,
            textAlign: "center",
            py: "12px",
          }}
        >
          No effective dates in the next 12 months.
        </Typography>
      )}

      <Box sx={{ overflowX: "auto" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: "4px",
            minWidth: "720px",
          }}
        >
          {months.map((ym, colIdx) => {
            const monthsFromNow = colIdx; // 0 = current month
            const isUrgent = monthsFromNow <= 2;
            const colDeadlines = byMonth.get(ym) ?? [];

            return (
              <Box
                key={ym}
                sx={{
                  borderRadius: "4px",
                  backgroundColor: isUrgent ? "rgba(19,113,91,0.035)" : "transparent",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minHeight: "72px",
                  px: "4px",
                  py: "6px",
                }}
              >
                {/* Markers stack */}
                <Stack
                  gap="3px"
                  alignItems="center"
                  sx={{ flex: 1, justifyContent: "flex-end", width: "100%" }}
                >
                  {colDeadlines.map((d, mIdx) => {
                    // markerIdxMap carries the real position of each deadline in the
                    // top-level `deadlines` array, built once before the grid render.
                    // Using it here avoids findIndex which returns the FIRST match and
                    // would jump to the wrong row when two deadlines share the same
                    // countrySlug + regulationName + effectiveDateISO triple.
                    const stableIdx = markerIdxMap.get(d) ?? mIdx;
                    const ariaLabel = `${d.regulationName} — ${d.effectiveDateRaw || ym} (${d.countryName})`;

                    return (
                      <VWTooltip
                        key={`${d.countrySlug}-${mIdx}`}
                        header={d.regulationName}
                        content={
                          <>
                            <div>{d.effectiveDateRaw || d.effectiveDateISO}</div>
                            <div>
                              {d.countryFlag ? `${d.countryFlag} ` : ""}
                              {d.countryName}
                            </div>
                          </>
                        }
                        placement="top"
                      >
                        <Box
                          component="button"
                          onClick={() => handleClick(d, stableIdx)}
                          aria-label={ariaLabel}
                          sx={{
                            "background": "transparent",
                            "border": "none",
                            "cursor": "pointer",
                            "p": "0",
                            "display": "flex",
                            "alignItems": "center",
                            "justifyContent": "center",
                            "width": "22px",
                            "height": "22px",
                            "borderRadius": "50%",
                            "&:focus-visible": {
                              outline: `2px solid ${palette.brand.primary}`,
                              outlineOffset: "2px",
                            },
                          }}
                        >
                          {d.countryFlag ? (
                            <Box
                              component="span"
                              aria-hidden
                              sx={{ fontSize: "14px", lineHeight: 1 }}
                            >
                              {d.countryFlag}
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: palette.brand.primary,
                              }}
                            />
                          )}
                        </Box>
                      </VWTooltip>
                    );
                  })}
                </Stack>

                {/* Month label at the bottom */}
                <MonthLabel yearMonth={ym} isFirst={colIdx === 0} />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

export default function Deadlines() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useDeadlines();
  const deadlines: Deadline[] = Array.isArray(data?.data?.deadlines) ? data.data.deadlines : [];
  const unscheduled: Unscheduled[] = Array.isArray(data?.data?.unscheduled)
    ? data.data.unscheduled
    : [];
  const stale = data?.data?.stale === true;
  const isEmpty = !isLoading && deadlines.length === 0 && unscheduled.length === 0;

  // Highlighted row state for click-to-jump
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMarkerClick = useCallback((id: string) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(id);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

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
          message="No upcoming regulation deadlines are recorded yet. Effective-date milestones for AI regulations will appear here as they are published."
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

          {/* ── Next-12-months runway calendar ── */}
          <RunwayCalendar deadlines={deadlines} onMarkerClick={handleMarkerClick} />

          {deadlines.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: "15px", fontWeight: 600, mb: "8px" }}>
                Scheduled
              </Typography>
              <Stack gap="8px">
                {deadlines.map((d, i) => {
                  const rowId = `deadline-${d.countrySlug}-${i}`;
                  return (
                    <Row
                      key={`${d.countrySlug}-${d.regulationName}-${i}`}
                      id={rowId}
                      highlighted={highlightedId === rowId}
                    >
                      <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                        <Typography
                          sx={{ fontSize: "13px", fontWeight: 600, color: palette.brand.primary }}
                        >
                          {d.effectiveDateRaw || d.effectiveDateISO}
                        </Typography>
                        {d.status && (
                          <Chip
                            label={d.status}
                            variant={regulationStatusVariant(d.status)}
                            uppercase={false}
                          />
                        )}
                        <Typography
                          role="link"
                          tabIndex={0}
                          onClick={() => navigate(`/regulations-tracker/${d.countrySlug}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(`/regulations-tracker/${d.countrySlug}`);
                            }
                          }}
                          title={`View ${d.countryName}`}
                          sx={{
                            "fontSize": "12px",
                            "color": palette.text.tertiary,
                            "ml": "auto",
                            "display": "flex",
                            "alignItems": "center",
                            "gap": "4px",
                            "cursor": "pointer",
                            "&:hover": {
                              color: palette.brand.primary,
                              textDecoration: "underline",
                            },
                          }}
                        >
                          {d.countryFlag && (
                            <Box
                              component="span"
                              aria-hidden
                              sx={{ fontSize: "14px", lineHeight: 1 }}
                            >
                              {d.countryFlag}
                            </Box>
                          )}
                          {d.countryName}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontSize: "14px", fontWeight: 500, mt: "4px" }}>
                        {d.regulationName}
                      </Typography>
                      {d.sourceUrl && (
                        <Box sx={{ mt: "6px" }}>
                          <VWLink url={d.sourceUrl} openInNewTab alwaysShowIcon>
                            View source
                          </VWLink>
                        </Box>
                      )}
                    </Row>
                  );
                })}
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
                      {u.status && (
                        <Chip
                          label={u.status}
                          variant={regulationStatusVariant(u.status)}
                          uppercase={false}
                        />
                      )}
                      <Typography
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(`/regulations-tracker/${u.countrySlug}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/regulations-tracker/${u.countrySlug}`);
                          }
                        }}
                        title={`View ${u.countryName}`}
                        sx={{
                          "fontSize": "12px",
                          "color": palette.text.tertiary,
                          "ml": "auto",
                          "display": "flex",
                          "alignItems": "center",
                          "gap": "4px",
                          "cursor": "pointer",
                          "&:hover": {
                            color: palette.brand.primary,
                            textDecoration: "underline",
                          },
                        }}
                      >
                        {u.countryFlag && (
                          <Box
                            component="span"
                            aria-hidden
                            sx={{ fontSize: "14px", lineHeight: 1 }}
                          >
                            {u.countryFlag}
                          </Box>
                        )}
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
