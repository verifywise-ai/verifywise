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
import { Box, Stack, TablePagination, CircularProgress } from "@mui/material";
import { SearchX, AlertTriangle, CheckSquare, Square } from "lucide-react";
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
import { useAuth } from "../../../../application/hooks/useAuth";
import { useTrackerAlert } from "../useTrackerAlert";
import { CountryRow, CountryRowCard } from "../CountryRowCard";

const PAGE_SIZE = 24;

export default function Browse() {
  const navigate = useNavigate();
  const sidebar = useRegulationsTrackerSidebarContextSafe();
  const { userRoleName, isSuperAdmin } = useAuth();
  // Tracking is available to admins and editors. Other roles see a read-only catalogue.
  const canTrack =
    isSuperAdmin ||
    userRoleName === "Admin" ||
    userRoleName === "SuperAdmin" ||
    userRoleName === "Editor";
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
  // Unfiltered fetch used only to build the stable region dropdown — so selecting a region
  // never removes other regions from the list (fix: region options were previously derived
  // from the filtered result, which collapsed to a single option after region selection).
  const { data: allData } = useCountries({});

  const trackCountry = useTrackCountry();
  const untrackCountry = useUntrackCountry();
  const trackBulk = useTrackBulk();

  const rows: CountryRow[] = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    return list;
  }, [data]);

  const total = rows.length;

  // Build region options from the UNFILTERED country list so the dropdown always shows all
  // regions regardless of the active region/search filter.
  const regionOptions = useMemo(() => {
    const allRows: CountryRow[] = Array.isArray(allData?.data) ? allData.data : [];
    const allTotal = allRows.length;
    const regions = Array.from(new Set(allRows.map((r) => r.region).filter(Boolean))) as string[];
    regions.sort();
    return [
      { value: "", label: allTotal ? `All regions (${allTotal})` : "All regions" },
      ...regions.map((r) => ({
        value: r,
        label: r,
      })),
    ];
  }, [allData]);

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
        {/* Select-all checkbox area — only for roles that can track */}
        {canTrack && (
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
        )}
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
          <Stack gap="8px">
            {pagedRows.map((row) => {
              const isSelected = selected.includes(row.slug);
              return (
                <CountryRowCard
                  key={row.slug}
                  row={row}
                  onClick={() => navigate(`/regulations-tracker/${row.slug}`)}
                  actionLabel={canTrack ? (row.is_tracked ? "Untrack" : "Track") : undefined}
                  onAction={
                    canTrack
                      ? (e) => {
                          e.stopPropagation();
                          handleToggleTrack(row);
                        }
                      : undefined
                  }
                  actionDisabled={
                    (trackCountry.isPending && trackCountry.variables === row.slug) ||
                    (untrackCountry.isPending && untrackCountry.variables === row.slug)
                  }
                  checkbox={
                    !canTrack ? undefined : row.is_tracked ? (
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CheckSquare
                          size={16}
                          strokeWidth={2}
                          color={palette.status.success.text}
                          aria-label={`${row.name} is tracked`}
                        />
                      </Box>
                    ) : (
                      <Box
                        component="button"
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Select ${row.name}`}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          toggleRow(row.slug);
                        }}
                        sx={{
                          "width": 16,
                          "height": 16,
                          "flexShrink": 0,
                          "p": 0,
                          "border": "none",
                          "background": "none",
                          "cursor": "pointer",
                          "display": "flex",
                          "alignItems": "center",
                          "justifyContent": "center",
                          "&:focus-visible": {
                            outline: `2px solid ${palette.brand.primary}`,
                            outlineOffset: "2px",
                            borderRadius: "2px",
                          },
                        }}
                      >
                        <CheckSquare
                          size={16}
                          strokeWidth={2}
                          color={palette.brand.primary}
                          style={{ display: isSelected ? "block" : "none" }}
                          aria-hidden
                        />
                        <Square
                          size={16}
                          strokeWidth={2}
                          color={palette.text.tertiary}
                          style={{ display: isSelected ? "none" : "block" }}
                          aria-hidden
                        />
                      </Box>
                    )
                  }
                />
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
