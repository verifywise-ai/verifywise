/**
 * @fileoverview Regulations Tracker — Tracked tab.
 *
 * Lists countries the organization tracks and supports inline untracking.
 * Client-side sorting and pagination since the tracked list loads in full.
 *
 * @module pages/RegulationsTracker/Tracked
 */

import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Stack, TablePagination, CircularProgress } from "@mui/material";
import { Star, Compass, Bell, AlertTriangle } from "lucide-react";
import { CustomSelect } from "../../../components/CustomSelect";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import TablePaginationActions from "../../../components/TablePagination";
import { palette } from "../../../themes/palette";
import { useTracked, useUntrackCountry } from "../../../../application/hooks/useRegulationsTracker";
import { useRegulationsTrackerSidebarContextSafe } from "../../../../application/contexts/RegulationsTrackerSidebar.context";
import { useTrackerAlert } from "../useTrackerAlert";
import { CountryRow, CountryRowCard } from "../CountryRowCard";

const ROWS_PER_PAGE_OPTIONS = [12, 24, 48];

function sortValue(row: CountryRow, key: string): string {
  switch (key) {
    case "name":
      return (row.name || row.slug || "").toLowerCase();
    case "region":
      return (row.region || "").toLowerCase();
    default:
      return "";
  }
}

export default function Tracked() {
  const navigate = useNavigate();
  const sidebar = useRegulationsTrackerSidebarContextSafe();
  const { data, isLoading, isError } = useTracked();
  const untrackCountry = useUntrackCountry();
  const { showError, AlertSlot } = useTrackerAlert();

  const [sortValueKey, setSortValueKey] = useState("name-asc");
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);

  const [sortBy, sortDir] = useMemo(() => {
    const [by, dir] = sortValueKey.split("-");
    return [by, dir as "asc" | "desc"] as const;
  }, [sortValueKey]);

  const sortOptions = useMemo(
    () => [
      { value: "name-asc", label: "Name A–Z" },
      { value: "name-desc", label: "Name Z–A" },
      { value: "region-asc", label: "Region A–Z" },
    ],
    [],
  );

  const rows: CountryRow[] = useMemo(() => {
    const list = Array.isArray(data?.data) ? data.data : [];
    return list;
  }, [data]);

  // Region filter with per-region counts.
  const regionOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (r.region) counts[r.region] = (counts[r.region] ?? 0) + 1;
    }
    return [
      { value: "", label: `All regions (${rows.length})` },
      ...Object.keys(counts)
        .sort()
        .map((r) => ({ value: r, label: `${r} (${counts[r]})` })),
    ];
  }, [rows]);

  const filteredRows = useMemo(
    () => (region ? rows.filter((r) => r.region === region) : rows),
    [rows, region],
  );

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const av = sortValue(a, sortBy);
      const bv = sortValue(b, sortBy);
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredRows, sortBy, sortDir]);

  const pagedRows = useMemo(
    () => sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sortedRows, page, rowsPerPage],
  );

  const handleUntrack = useCallback(
    (row: CountryRow) => {
      untrackCountry.mutate(row.slug, {
        onSuccess: () => sidebar?.refreshTrackedCount(),
        onError: () => showError(`We couldn't untrack ${row.name}. Please try again.`),
      });
    },
    [untrackCountry, sidebar, showError],
  );

  // Clamp the page when the tracked list shrinks below the current page's range.
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(sortedRows.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [sortedRows.length, rowsPerPage, page]);

  const isEmpty = !isLoading && rows.length === 0;

  return (
    <PageHeaderExtended
      title="Tracked countries"
      description="Countries and jurisdictions your organization is tracking. You'll be notified when their AI regulations change."
      helpArticlePath="regulations-tracker/tracked"
    >
      {AlertSlot}

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: "48px" }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          message="We couldn't load your tracked countries right now. Please try again later."
          showBorder
        />
      )}

      {isEmpty && !isError && (
        <EmptyState
          icon={Star}
          message="You're not tracking any countries yet. Track jurisdictions from the Browse tab to monitor their AI regulation changes."
          showBorder
        >
          <EmptyStateTip
            icon={Compass}
            title="Find countries in Browse"
            description="Open the Browse tab to explore the full catalogue, then track the countries relevant to your organization."
          />
          <EmptyStateTip
            icon={Bell}
            title="Get notified when regulations change"
            description="Tracked countries are monitored for regulatory updates. Configured recipients are notified when changes are detected."
          />
        </EmptyState>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "16px" }}>
            <CustomSelect
              currentValue={region}
              onValueChange={async (v) => {
                setRegion(String(v));
                setPage(0);
                return true;
              }}
              options={regionOptions}
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

          <Stack gap="2px">
            {pagedRows.map((row) => (
              <CountryRowCard
                key={row.slug}
                row={row}
                onClick={() => navigate(`/regulations-tracker/${row.slug}`)}
                actionLabel="Untrack"
                onAction={() => handleUntrack(row)}
                actionDisabled={untrackCountry.isPending && untrackCountry.variables === row.slug}
              />
            ))}
          </Stack>

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
