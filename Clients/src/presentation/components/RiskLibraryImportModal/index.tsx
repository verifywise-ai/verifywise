import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Radio,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Search } from "lucide-react";
import { searchRiskLibrary } from "../../../application/repository/riskLibrary.repository";
import { RiskLibraryEntry } from "../../../domain/types/RiskLibrary";
import { SelectedRiskData, DEFAULT_VALUES } from "../RiskDatabaseModal/types";
import { mapRiskCategories } from "../RiskDatabaseModal/utils";
import { Likelihood, Severity } from "../RiskLevel/constants";

interface Props {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRiskSelected?: (riskData: SelectedRiskData) => void;
}

const DEBOUNCE_MS = 400;

const severityMap: Record<string, Severity> = {
  Negligible: Severity.Negligible,
  Minor: Severity.Minor,
  Moderate: Severity.Moderate,
  Major: Severity.Major,
  Catastrophic: Severity.Catastrophic,
};

const likelihoodMap: Record<string, Likelihood> = {
  Rare: Likelihood.Rare,
  Unlikely: Likelihood.Unlikely,
  Possible: Likelihood.Possible,
  Likely: Likelihood.Likely,
  "Almost Certain": Likelihood.AlmostCertain,
};

const RiskLibraryImportModal = ({ isOpen, setIsOpen, onRiskSelected }: Props) => {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [entries, setEntries] = useState<RiskLibraryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch entries
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const fetchEntries = async () => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          page: page + 1,
          limit: rowsPerPage,
        };
        if (debouncedSearch) params.search = debouncedSearch;

        const response = await searchRiskLibrary({ params: params as any });
        const data = response?.data || response;
        if (!cancelled) {
          setEntries(data.entries || []);
          setTotal(data.pagination?.total || 0);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEntries();
    return () => { cancelled = true; };
  }, [isOpen, debouncedSearch, page, rowsPerPage]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchInput("");
    setSelectedId(null);
    setPage(0);
  }, [setIsOpen]);

  const handleImport = useCallback(() => {
    const entry = entries.find((e) => e.id === selectedId);
    if (!entry || !onRiskSelected) return;

    const mappedData: SelectedRiskData = {
      riskName: entry.summary,
      actionOwner: DEFAULT_VALUES.ACTION_OWNER,
      aiLifecyclePhase: DEFAULT_VALUES.AI_LIFECYCLE_PHASE,
      riskDescription: entry.description,
      riskCategory: entry.risk_category
        ? mapRiskCategories(entry.risk_category)
        : [DEFAULT_VALUES.DEFAULT_CATEGORY_ID],
      potentialImpact: DEFAULT_VALUES.POTENTIAL_IMPACT,
      assessmentMapping: DEFAULT_VALUES.ASSESSMENT_MAPPING,
      controlsMapping: DEFAULT_VALUES.CONTROLS_MAPPING,
      likelihood: entry.likelihood
        ? likelihoodMap[entry.likelihood] ?? Likelihood.Possible
        : Likelihood.Possible,
      riskSeverity: entry.severity
        ? severityMap[entry.severity] ?? Severity.Moderate
        : Severity.Moderate,
      riskLevel: DEFAULT_VALUES.RISK_LEVEL,
      reviewNotes: `Imported from Risk Intelligence Library — Source: ${entry.source}${
        entry.domain ? `, Domain: ${entry.domain}` : ""
      }${entry.eu_ai_act_tier ? `, EU AI Act: ${entry.eu_ai_act_tier}` : ""}`,
      applicableProjects: [],
      applicableFrameworks: [],
    };

    onRiskSelected(mappedData);
    handleClose();
  }, [entries, selectedId, onRiskSelected, handleClose]);

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import from Risk Intelligence Library</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Search and select a risk from the AI-powered Risk Intelligence Library.
        </Typography>

        <TextField
          size="small"
          fullWidth
          placeholder="Search risks..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        <TableContainer sx={{ maxHeight: "50vh" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} />
                <TableCell sx={{ fontWeight: 600, width: 80 }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Summary</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 100 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 100 }}>Likelihood</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 100 }}>EU AI Act</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: "center", py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Loading...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: "center", py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No entries found. Try adjusting your search.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    hover
                    selected={selectedId === entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Radio
                        size="small"
                        checked={selectedId === entry.id}
                        onChange={() => setSelectedId(entry.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={entry.source} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                        {entry.summary}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {entry.severity || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {entry.likelihood || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {entry.eu_ai_act_tier || "-"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={selectedId === null}
        >
          Import Risk
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RiskLibraryImportModal;
