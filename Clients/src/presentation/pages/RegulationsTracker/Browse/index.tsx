/**
 * @fileoverview Regulations Tracker — Browse tab.
 *
 * Lists the full country/jurisdiction catalogue with region filter and search.
 * Supports per-row tracking and bulk-track selection.
 *
 * @module pages/RegulationsTracker/Browse
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Stack, TablePagination, CircularProgress, Typography } from "@mui/material";
import { SearchX, AlertTriangle, Globe } from "lucide-react";
import { SearchBox } from "../../../components/Search";
import { CustomSelect } from "../../../components/CustomSelect";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import TablePaginationActions from "../../../components/TablePagination";
import { palette } from "../../../themes/palette";
import {
  useCountries,
  useTrackCountry,
  useUntrackCountry,
  useTrackBulk,
} from "../../../../application/hooks/useRegulationsTracker";
import { useRegulationsTrackerSidebarContextSafe } from "../../../../application/contexts/RegulationsTrackerSidebar.context";
import { useTrackerAlert } from "../useTrackerAlert";

const PAGE_SIZE = 24;

interface CountryRow {
  slug: string;
  name: string;
  region?: string;
  iso2?: string;
  is_tracked?: boolean;
}

export default function Browse() {
  const navigate = useNavigate();
  const sidebar = useRegulationsTrackerSidebarContextSafe();
  const { showError, AlertSlot } = useTrackerAlert();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  // Debounce the search input (~300ms) before it hits the query.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading, isError } = useCountries({ region, q: search });

  const trackCountry = useTrackCountry();
  const untrackCountry = useUntrackCountry();
  const trackBulk = useTrackBulk();

  const rows: CountryRow[] = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    return list;
  }, [data]);

  const total = rows.length;

  // Build region options from the full dataset.
  const regionOptions = useMemo(() => {
    const regions = Array.from(new Set(rows.map((r) => r.region).filter(Boolean))) as string[];
    regions.sort();
    return [
      { value: "", label: total ? `All regions (${total})` : "All regions" },
      ...regions.map((r) => ({
        value: r,
        label: r,
      })),
    ];
  }, [rows, total]);

  const pagedRows = useMemo(
    () => rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [rows, page],
  );

  // Clamp page when dataset shrinks.
  useEffect(() => {
    if (total > 0 && page > 0 && page * PAGE_SIZE >= total) {
      setPage(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
    }
  }, [total, page]);

  // Only untracked rows are selectable for bulk-track.
  const selectableSlugs = useMemo(
    () => pagedRows.filter((r) => !r.is_tracked).map((r) => r.slug),
    [pagedRows],
  );
  const allOnPageSelected =
    selectableSlugs.length > 0 && selectableSlugs.every((s) => selected.includes(s));
  const someOnPageSelected = selectableSlugs.some((s) => selected.includes(s));

  // Clear selection when filters/page change.
  useEffect(() => {
    setSelected([]);
  }, [search, region, page]);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (allOnPageSelected) {
        return prev.filter((s) => !selectableSlugs.includes(s));
      }
      const next = new Set(prev);
      selectableSlugs.forEach((s) => next.add(s));
      return Array.from(next);
    });
  }, [allOnPageSelected, selectableSlugs]);

  const toggleRow = useCallback((slug: string) => {
    setSelected((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }, []);

  const handleTrackSelected = useCallback(() => {
    if (selected.length === 0) return;
    trackBulk.mutate(selected, {
      onSuccess: () => {
        setSelected([]);
        sidebar?.refreshTrackedCount();
      },
      onError: () => showError("We couldn't track the selected countries. Please try again."),
    });
  }, [selected, trackBulk, sidebar, showError]);

  const handleToggleTrack = useCallback(
    (row: CountryRow) => {
      const onDone = () => sidebar?.refreshTrackedCount();
      if (row.is_tracked) {
        untrackCountry.mutate(row.slug, {
          onSuccess: onDone,
          onError: () => showError(`We couldn't untrack ${row.name}. Please try again.`),
        });
      } else {
        trackCountry.mutate(row.slug, {
          onSuccess: onDone,
          onError: () => showError(`We couldn't track ${row.name}. Please try again.`),
        });
      }
    },
    [trackCountry, untrackCountry, sidebar, showError],
  );

  const isEmpty = !isLoading && rows.length === 0;

  return (
    <PageHeaderExtended
      title="Regulations tracker"
      description="Browse the catalogue of countries and jurisdictions. Track the ones relevant to your organization to receive updates when their AI regulations change."
      helpArticlePath="regulations-tracker/browse"
    >
      {AlertSlot}

      {/* Filters */}
      <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap" sx={{ mb: "16px" }}>
        <SearchBox
          placeholder="Search countries or jurisdictions"
          value={searchInput}
          onChange={(value) => setSearchInput(value)}
          fullWidth={false}
          sx={{ width: 280 }}
        />
        <CustomSelect
          currentValue={region}
          onValueChange={async (v) => {
            setRegion(String(v));
            setPage(0);
            return true;
          }}
          options={regionOptions}
        />
        <Box sx={{ flex: 1 }} />
        {/* Select-all checkbox area */}
        <Stack direction="row" alignItems="center" gap="8px">
          <Box
            component="input"
            type="checkbox"
            aria-label="Select all on page"
            checked={allOnPageSelected}
            ref={(el: HTMLInputElement | null) => {
              if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
            }}
            onChange={toggleSelectAll}
            sx={{ cursor: "pointer", width: 16, height: 16, accentColor: palette.brand.primary }}
          />
          <CustomizableButton
            text={`Track selected (${selected.length})`}
            onClick={handleTrackSelected}
            isDisabled={selected.length === 0 || trackBulk.isPending}
            sx={{ height: 34 }}
          />
        </Stack>
      </Stack>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: "48px" }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          message="We couldn't load the regulations catalogue right now. Please try again later."
          showBorder
        />
      )}

      {isEmpty && !isError && (
        <EmptyState icon={SearchX} message="No countries match your filters." showBorder />
      )}

      {!isLoading && !isError && pagedRows.length > 0 && (
        <>
          {/* Country rows */}
          <Stack gap="2px">
            {pagedRows.map((row) => {
              const isSelected = selected.includes(row.slug);
              return (
                <Box
                  key={row.slug}
                  sx={{
                    "display": "flex",
                    "alignItems": "center",
                    "gap": "12px",
                    "border": `1px solid ${palette.border.dark}`,
                    "borderRadius": "4px",
                    "p": "10px 12px",
                    "backgroundColor": palette.background.main,
                    "cursor": "pointer",
                    "&:hover": { backgroundColor: palette.background.accent },
                  }}
                  onClick={() => navigate(`/regulations-tracker/${row.slug}`)}
                >
                  {/* Select checkbox (stop propagation so click doesn't open detail) */}
                  <Box
                    component="input"
                    type="checkbox"
                    aria-label={`Select ${row.name}`}
                    checked={isSelected}
                    disabled={row.is_tracked}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      e.stopPropagation();
                      toggleRow(row.slug);
                    }}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    sx={{
                      cursor: row.is_tracked ? "default" : "pointer",
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      accentColor: palette.brand.primary,
                    }}
                  />

                  {/* Flag / icon */}
                  <Globe size={16} strokeWidth={1.5} color={palette.text.tertiary} />

                  {/* Country name + region */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{ fontSize: "14px", fontWeight: 500, color: palette.text.primary }}
                    >
                      {row.name}
                    </Typography>
                    {row.region && (
                      <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                        {row.region}
                      </Typography>
                    )}
                  </Box>

                  {/* Track / Untrack button */}
                  <CustomizableButton
                    text={row.is_tracked ? "Untrack" : "Track"}
                    variant="outlined"
                    size="small"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleToggleTrack(row);
                    }}
                    isDisabled={
                      (trackCountry.isPending && trackCountry.variables === row.slug) ||
                      (untrackCountry.isPending && untrackCountry.variables === row.slug)
                    }
                    sx={{ flexShrink: 0 }}
                  />
                </Box>
              );
            })}
          </Stack>

          <Stack direction="row" alignItems="center" justifyContent="flex-end">
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]}
              ActionsComponent={TablePaginationActions as any}
              labelRowsPerPage="Rows per page"
              sx={{ mt: "24px" }}
            />
          </Stack>
        </>
      )}
    </PageHeaderExtended>
  );
}
