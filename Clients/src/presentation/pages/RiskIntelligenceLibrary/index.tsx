import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, InputAdornment, TextField } from "@mui/material";
import { Search } from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import RiskLibraryFilterBar from "./RiskLibraryFilters";
import RiskLibraryTable from "./RiskLibraryTable";
import RiskLibraryDetail from "./RiskLibraryDetail";
import {
  useRiskLibrarySearch,
  useRiskLibraryFilters,
  useRiskLibraryEntry,
  useSubmitFeedback,
  useRemoveFeedback,
} from "../../../application/hooks/useRiskLibrary";
import { RiskLibraryEntry, RiskLibrarySearchParams } from "../../../domain/types/RiskLibrary";

const DEBOUNCE_MS = 400;

const RiskIntelligenceLibrary = () => {
  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [filters, setFilters] = useState({
    source: "",
    risk_type: "",
    risk_source: "",
    domain: "",
    eu_ai_act_tier: "",
    severity: "",
    likelihood: "",
    industry: "",
    lifecycle_phase: "",
  });

  // Detail drawer state
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Build search params
  const searchParams: RiskLibrarySearchParams = useMemo(() => {
    const params: RiskLibrarySearchParams = { page, limit };
    if (debouncedSearch) params.search = debouncedSearch;
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        (params as Record<string, unknown>)[key] = value;
      }
    });
    return params;
  }, [debouncedSearch, page, limit, filters]);

  // Queries
  const { data: searchResult, isLoading } = useRiskLibrarySearch(searchParams);
  const { data: filterOptions } = useRiskLibraryFilters();
  const { data: entryDetail } = useRiskLibraryEntry(selectedEntryId);

  // Feedback mutations
  const submitFeedback = useSubmitFeedback();
  const removeFeedback = useRemoveFeedback();

  // Handlers
  const handleFilterChange = useCallback(
    (key: keyof typeof filters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    []
  );

  const handleRowClick = useCallback((entry: RiskLibraryEntry) => {
    setSelectedEntryId(entry.id);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedEntryId(null);
  }, []);

  return (
    <PageHeaderExtended
      title="Risk Intelligence Library"
      description="Browse, search, and generate AI risk scenarios with multi-dimensional taxonomy. Powered by MIT, IBM, and AI-generated intelligence."
    >
      {/* Search bar */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search risks by keyword..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={18} />
              </InputAdornment>
            ),
          }}
          sx={{ maxWidth: 500 }}
        />
      </Box>

      {/* Filters */}
      <RiskLibraryFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        filterOptions={filterOptions}
      />

      {/* Table */}
      <RiskLibraryTable
        entries={searchResult?.entries || []}
        pagination={
          searchResult?.pagination || {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 0,
          }
        }
        onPageChange={setPage}
        onRowsPerPageChange={(newLimit) => {
          setLimit(newLimit);
          setPage(1);
        }}
        onRowClick={handleRowClick}
      />

      {/* Detail drawer */}
      <RiskLibraryDetail
        detail={entryDetail || null}
        open={drawerOpen}
        onClose={handleCloseDrawer}
        onSubmitFeedback={submitFeedback.mutate}
        onRemoveFeedback={removeFeedback.mutate}
        isFeedbackSubmitting={submitFeedback.isPending || removeFeedback.isPending}
      />
    </PageHeaderExtended>
  );
};

export default RiskIntelligenceLibrary;
