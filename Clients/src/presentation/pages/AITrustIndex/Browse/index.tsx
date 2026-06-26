/**
 * @fileoverview AI Trust Index — Browse tab.
 *
 * Server-paginated catalogue of assessed AI apps with search, category/grade
 * filters, sort, bulk-select tracking, and per-row track/untrack.
 *
 * @module pages/AITrustIndex/Browse
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Stack, TablePagination, CircularProgress } from "@mui/material";
import { SearchX, AlertTriangle } from "lucide-react";
import Checkbox from "../../../components/Inputs/Checkbox";
import { SearchBox } from "../../../components/Search";
import { CustomSelect } from "../../../components/CustomSelect";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import TablePaginationActions from "../../../components/TablePagination";
import { palette } from "../../../themes/palette";
import {
  useApps,
  useTrackApp,
  useUntrackApp,
  useTrackAppsBulk,
} from "../../../../application/hooks/useAiTrustIndex";
import { useAITrustIndexSidebarContextSafe } from "../../../../application/contexts/AITrustIndexSidebar.context";
import { TrustIndexRow } from "../shared";
import AppCard from "../components/AppCard";
import { useTrustIndexAlert } from "../useTrustIndexAlert";

// 24 = 8 rows × 3 columns, so the grid's last row stays even.
const PAGE_SIZE = 24;

export default function Browse() {
  const navigate = useNavigate();
  const sidebar = useAITrustIndexSidebarContextSafe();
  const { showError, AlertSlot } = useTrustIndexAlert();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [grade, setGrade] = useState("");
  // Sort is dropdown-driven for the card grid. Each option maps to a backend
  // sort column + direction the getAppsQuery whitelist can honour.
  const [sortValue, setSortValue] = useState("score-desc");
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

  const [sortBy, sortDir] = useMemo(() => {
    const [by, dir] = sortValue.split("-");
    return [by, dir as "asc" | "desc"] as const;
  }, [sortValue]);

  const { data, isLoading, isError } = useApps({
    search,
    category,
    grade,
    sort: sortBy,
    dir: sortDir,
    page: page + 1,
    pageSize: PAGE_SIZE,
  });

  const trackApp = useTrackApp();
  const untrackApp = useUntrackApp();
  const trackBulk = useTrackAppsBulk();

  const payload = data?.data;
  const rows: TrustIndexRow[] = useMemo(() => payload?.apps ?? [], [payload]);
  const total: number = payload?.total ?? 0;

  // Clamp the page if the result set shrank below the current page's range
  // (e.g. after a filter change or an untrack that removed the last row of the
  // last page). Without this the user is stranded on an empty grid with the
  // pagination pointing past the end. Guarded on total > 0 so an empty result
  // (handled by the empty state) does not force page 0 mid-load.
  useEffect(() => {
    if (total > 0 && page > 0 && page * PAGE_SIZE >= total) {
      setPage(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
    }
  }, [total, page]);
  const categories: string[] = useMemo(() => payload?.categories ?? [], [payload]);
  const categoryCounts: Record<string, number> = useMemo(
    () => payload?.categoryCounts ?? {},
    [payload],
  );
  const gradeCounts: Record<string, number> = useMemo(() => payload?.gradeCounts ?? {}, [payload]);
  // Total across the whole active catalog, for the "All" options. Counts are
  // catalog-wide (not filtered), so summing them gives the catalog size.
  const catalogTotal = useMemo(
    () => Object.values(categoryCounts).reduce((s, n) => s + n, 0),
    [categoryCounts],
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: catalogTotal ? `All categories (${catalogTotal})` : "All categories" },
      ...categories.map((c) => ({
        value: c,
        label: categoryCounts[c] != null ? `${c} (${categoryCounts[c]})` : c,
      })),
    ],
    [categories, categoryCounts, catalogTotal],
  );
  const gradeOptions = useMemo(
    () => [
      { value: "", label: catalogTotal ? `All grades (${catalogTotal})` : "All grades" },
      ...["A", "B", "C", "D", "F"].map((g) => ({
        value: g,
        label: gradeCounts[g] != null ? `${g} (${gradeCounts[g]})` : g,
      })),
    ],
    [gradeCounts, catalogTotal],
  );
  const sortOptions = useMemo(
    () => [
      { value: "score-desc", label: "Best score first" },
      { value: "score-asc", label: "Worst score first" },
      { value: "name-asc", label: "Name A–Z" },
      { value: "name-desc", label: "Name Z–A" },
      { value: "vendor-asc", label: "Vendor A–Z" },
      { value: "category-asc", label: "Category A–Z" },
    ],
    [],
  );

  // Selection only ever concerns rows that can actually be tracked. Already-
  // tracked apps are excluded from select-all and the "track selected" count so
  // bulk-track never re-tracks an app or misrepresents how many are new.
  const selectableSlugs = useMemo(
    () => rows.filter((r) => !r.is_tracked).map((r) => r.slug),
    [rows],
  );
  const allOnPageSelected =
    selectableSlugs.length > 0 && selectableSlugs.every((s) => selected.includes(s));
  const someOnPageSelected = selectableSlugs.some((s) => selected.includes(s));

  // Clear the selection whenever the visible set changes (search, filters, sort,
  // page). Otherwise slugs selected on a prior page/filter stay in `selected`
  // and get bulk-tracked even though they are no longer on screen.
  useEffect(() => {
    setSelected([]);
  }, [search, category, grade, sortValue, page]);

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
      onError: () => showError("We couldn't track the selected apps. Please try again."),
    });
  }, [selected, trackBulk, sidebar, showError]);

  const handleToggleTrack = useCallback(
    (row: TrustIndexRow) => {
      const onDone = () => sidebar?.refreshTrackedCount();
      if (row.is_tracked) {
        untrackApp.mutate(row.slug, {
          onSuccess: onDone,
          onError: () => showError(`We couldn't untrack ${row.name}. Please try again.`),
        });
      } else {
        trackApp.mutate(row.slug, {
          onSuccess: onDone,
          onError: () => showError(`We couldn't track ${row.name}. Please try again.`),
        });
      }
    },
    [trackApp, untrackApp, sidebar, showError],
  );

  const isEmpty = !isLoading && rows.length === 0;

  return (
    <PageHeaderExtended
      title="AI Trust Index"
      description="Browse independently assessed AI applications and track the ones that matter to your organization."
      helpArticlePath="ai-trust-index/browse"
    >
      {AlertSlot}
      {/* Filters */}
      <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap" sx={{ mb: "16px" }}>
        <SearchBox
          placeholder="Search apps or vendors"
          value={searchInput}
          onChange={(value) => setSearchInput(value)}
          fullWidth={false}
          sx={{ width: 260 }}
        />
        <CustomSelect
          currentValue={category}
          onValueChange={async (v) => {
            setCategory(String(v));
            setPage(0);
            return true;
          }}
          options={categoryOptions}
        />
        <CustomSelect
          currentValue={grade}
          onValueChange={async (v) => {
            setGrade(String(v));
            setPage(0);
            return true;
          }}
          options={gradeOptions}
        />
        <CustomSelect
          currentValue={sortValue}
          onValueChange={async (v) => {
            setSortValue(String(v));
            setPage(0);
            return true;
          }}
          options={sortOptions}
        />
        <Box sx={{ flex: 1 }} />
        {/* Select-all checkbox placed in filter bar so it is adjacent to the table */}
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Checkbox
            id="ai-trust-index-select-all"
            size="small"
            value="select-all"
            isChecked={allOnPageSelected}
            isIndeterminate={!allOnPageSelected && someOnPageSelected}
            onChange={toggleSelectAll}
            ariaLabel="Select all on page"
          />
        </Box>
        <CustomizableButton
          text={`Track selected (${selected.length})`}
          onClick={handleTrackSelected}
          isDisabled={selected.length === 0 || trackBulk.isPending}
          sx={{ height: 34 }}
        />
      </Stack>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          message="We couldn't load the AI Trust Index right now. Please try again later."
          showBorder
        />
      )}

      {isEmpty && !isError && (
        <EmptyState icon={SearchX} message="No apps match your filters." showBorder />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                lg: "repeat(3, 1fr)",
              },
              gap: "16px",
              alignItems: "stretch",
            }}
          >
            {rows.map((row) => (
              <AppCard
                key={row.slug}
                row={row}
                selectable
                selected={selected.includes(row.slug)}
                onOpen={(slug) => navigate(`/ai-trust-index/${slug}`)}
                onToggleSelect={toggleRow}
                actions={
                  <CustomizableButton
                    text={row.is_tracked ? "Untrack" : "Track"}
                    variant="outlined"
                    size="small"
                    onClick={() => handleToggleTrack(row)}
                    // Disable only the row whose track/untrack is in flight, not
                    // every card in the grid.
                    isDisabled={
                      (trackApp.isPending && trackApp.variables === row.slug) ||
                      (untrackApp.isPending && untrackApp.variables === row.slug)
                    }
                  />
                }
              />
            ))}
          </Box>
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
