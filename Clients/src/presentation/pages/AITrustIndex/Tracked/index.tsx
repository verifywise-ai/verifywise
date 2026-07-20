/**
 * @fileoverview AI Trust Index — Tracked tab.
 *
 * Lists apps the organization tracks, flags ones removed from the index, and
 * supports inline untracking. Sorting and pagination are fully client-side
 * since the tracked list is loaded in full.
 *
 * @module pages/AITrustIndex/Tracked
 */

import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Stack, TablePagination, CircularProgress } from "@mui/material";
import { Star, Compass, Bell, AlertTriangle } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { CustomSelect } from "../../../components/CustomSelect";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import Chip from "../../../components/Chip";
import TablePaginationActions from "../../../components/TablePagination";
import { palette } from "../../../themes/palette";
import { useTracked, useUntrackApp } from "../../../../application/hooks/useAiTrustIndex";
import { useAITrustIndexSidebarContextSafe } from "../../../../application/contexts/AITrustIndexSidebar.context";
import { TrustIndexRow } from "../shared";
import AppCard from "../components/AppCard";
import { useTrustIndexAlert } from "../useTrustIndexAlert";

const ROWS_PER_PAGE_OPTIONS = [12, 24, 48];

/** Pull the comparable value for a given sort column out of a row. */
function sortValue(row: TrustIndexRow, key: string): string | number {
  switch (key) {
    case "name":
      return (row.name || row.slug || "").toLowerCase();
    case "category":
      return (row.category || "").toLowerCase();
    case "score":
      return row.score_out_of_100 ?? -1;
    case "status":
      // Tracked sorts before "No longer in index".
      return row.no_longer_in_index ? 1 : 0;
    default:
      return "";
  }
}

export default function Tracked() {
  const navigate = useNavigate();
  const sidebar = useAITrustIndexSidebarContextSafe();
  const { data, isLoading, isError } = useTracked();
  const untrackApp = useUntrackApp();
  const { showError, AlertSlot } = useTrustIndexAlert();

  const [sortValueKey, setSortValueKey] = useState("score-desc");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);

  const [sortBy, sortDir] = useMemo(() => {
    const [by, dir] = sortValueKey.split("-");
    return [by, dir as "asc" | "desc"] as const;
  }, [sortValueKey]);

  const sortOptions = useMemo(
    () => [
      { value: "score-desc", label: "Best score first" },
      { value: "score-asc", label: "Worst score first" },
      { value: "name-asc", label: "Name A–Z" },
      { value: "name-desc", label: "Name Z–A" },
      { value: "category-asc", label: "Category A–Z" },
      { value: "status-asc", label: "Tracked first" },
    ],
    [],
  );

  const rows: TrustIndexRow[] = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    // Backend rows expose app_slug; normalize to slug for navigation/keys.
    return list.map((r: any) => ({ ...r, slug: r.slug ?? r.app_slug }));
  }, [data]);

  // Category filter, with per-category counts computed from the fully-loaded
  // tracked list. "All" shows the total tracked count.
  const categoryOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (r.category) counts[r.category] = (counts[r.category] ?? 0) + 1;
    }
    return [
      { value: "", label: `All categories (${rows.length})` },
      ...Object.keys(counts)
        .sort()
        .map((c) => ({ value: c, label: `${c} (${counts[c]})` })),
    ];
  }, [rows]);

  const filteredRows = useMemo(
    () => (category ? rows.filter((r) => r.category === category) : rows),
    [rows, category],
  );

  // Client-side sort over the filtered rows.
  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const av = sortValue(a, sortBy);
      const bv = sortValue(b, sortBy);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, sortBy, sortDir]);

  const pagedRows = useMemo(
    () => sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sortedRows, page, rowsPerPage],
  );

  const handleUntrack = useCallback(
    (row: TrustIndexRow) => {
      untrackApp.mutate(row.slug, {
        onSuccess: () => sidebar?.refreshTrackedCount(),
        onError: () => showError(`We couldn't untrack ${row.name}. Please try again.`),
      });
    },
    [untrackApp, sidebar, showError],
  );

  // Clamp the page when the tracked list shrinks below the current page's range
  // (e.g. untracking the last app on the last page). Keeps the user on a page
  // that has rows instead of an empty grid.
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(sortedRows.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [sortedRows.length, rowsPerPage, page]);

  const isEmpty = !isLoading && rows.length === 0;

  return (
    <PageHeaderExtended
      title="Tracked apps"
      description="AI applications your organization is tracking. We'll notify recipients when a tracked app's assessment changes materially."
      helpArticlePath="ai-trust-index/tracked"
    >
      {AlertSlot}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          message="We couldn't load your tracked apps right now. Please try again later."
          showBorder
        />
      )}

      {isEmpty && !isError && (
        <EmptyState
          icon={Star}
          message="You're not tracking any apps yet. Track apps from the Browse tab to monitor changes to their privacy and transparency assessments."
          showBorder
        >
          <EmptyStateTip
            icon={Compass}
            title="Find apps in Browse"
            description="Open the Browse tab to explore the full catalogue, then track the apps your teams use with the Track button on each card."
          />
          <EmptyStateTip
            icon={Bell}
            title="Get notified when assessments change"
            description="Tracked apps are included in the weekly change digest, so configured recipients hear about score, grade, or policy changes."
          />
        </EmptyState>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "16px" }}>
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
              currentValue={sortValueKey}
              onValueChange={async (v) => {
                setSortValueKey(String(v));
                setPage(0);
                return true;
              }}
              options={sortOptions}
            />
          </Stack>

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
            {pagedRows.map((row) => (
              <AppCard
                key={row.app_slug ?? row.slug}
                row={row}
                onOpen={(slug) => navigate(`/ai-trust-index/${slug}`)}
                dimmed={row.no_longer_in_index}
                statusChip={
                  row.no_longer_in_index ? (
                    <Chip label="No longer in index" variant="warning" uppercase={false} />
                  ) : (
                    <Chip label="Tracked" variant="success" uppercase={false} />
                  )
                }
                actions={
                  <CustomizableButton
                    text="Untrack"
                    variant="outlined"
                    size="small"
                    onClick={() => handleUntrack(row)}
                    isDisabled={untrackApp.isPending && untrackApp.variables === row.slug}
                  />
                }
              />
            ))}
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="flex-end">
            <TablePagination
              component="div"
              count={sortedRows.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              ActionsComponent={TablePaginationActions as any}
              labelRowsPerPage="Per page"
              sx={{ mt: "24px" }}
            />
          </Stack>
        </>
      )}
    </PageHeaderExtended>
  );
}
