import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Drawer,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { Search, X } from "lucide-react";
import RiskLibraryFilterBar from "./RiskLibraryFilters";
import RiskLibraryTable from "./RiskLibraryTable";
import RiskLibraryDetail from "./RiskLibraryDetail";
import GeneratePanel, { GenerateKeyBanner } from "./GeneratePanel";
import {
  useRiskLibrarySearch,
  useRiskLibraryFilters,
  useRiskLibraryEntry,
  useSubmitFeedback,
  useRemoveFeedback,
} from "../../../application/hooks/useRiskLibrary";
import { RiskLibraryEntry, RiskLibrarySearchParams } from "../../../domain/types/RiskLibrary";

const DEBOUNCE_MS = 400;

interface Props {
  open: boolean;
  onClose: () => void;
}

const RiskLibraryDrawer = ({ open, onClose }: Props) => {
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

  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  const { data: searchResult } = useRiskLibrarySearch(searchParams);
  const { data: filterOptions } = useRiskLibraryFilters();
  const { data: entryDetail } = useRiskLibraryEntry(selectedEntryId);

  const submitFeedback = useSubmitFeedback();
  const removeFeedback = useRemoveFeedback();

  const handleFilterChange = useCallback(
    (key: keyof typeof filters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    []
  );

  const handleRowClick = useCallback((entry: RiskLibraryEntry) => {
    setSelectedEntryId(entry.id);
    setDetailDrawerOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailDrawerOpen(false);
    setSelectedEntryId(null);
  }, []);

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: { xs: "100%", md: "70%", lg: "60%" },
            maxWidth: 1000,
            p: 3,
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Risk Intelligence Library
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Browse, search, and generate AI risk scenarios.
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <X size={18} />
          </IconButton>
        </Box>

        <GenerateKeyBanner />

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <TextField
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
            sx={{ maxWidth: 400, flex: 1 }}
          />
          <GeneratePanel />
        </Box>

        <RiskLibraryFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          filterOptions={filterOptions}
        />

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
      </Drawer>

      <RiskLibraryDetail
        detail={entryDetail || null}
        open={detailDrawerOpen}
        onClose={handleCloseDetail}
        onSubmitFeedback={submitFeedback.mutate}
        onRemoveFeedback={removeFeedback.mutate}
        isFeedbackSubmitting={submitFeedback.isPending || removeFeedback.isPending}
      />
    </>
  );
};

export default RiskLibraryDrawer;
