import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
} from "@mui/material";
import { aiTrustCenterTableCell } from "../style";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { brand, text, background } from "../../../themes/palette";

const SUBPROCESSORS_SORTING_KEY = "verifywise_subprocessors_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const Subprocessors = ({
  data,
  loading,
  error,
}: {
  data: any;
  loading: boolean;
  error: string | null;
}) => {
  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(SUBPROCESSORS_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_error) {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(SUBPROCESSORS_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Sorting handlers
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        // Toggle direction if same column, or clear if already descending
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      // New column or first sort
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort the subprocessor data based on current sort configuration
  const sortedSubprocessors = useMemo(() => {
    if (!data?.subprocessor || !sortConfig.key || !sortConfig.direction) {
      return data?.subprocessor || [];
    }

    const sortableData = [...data.subprocessor];

    return sortableData.sort((a: any, b: any) => {
      let aValue: string;
      let bValue: string;

      // Use exact column name matching - case insensitive
      const sortKey = sortConfig.key.trim().toLowerCase();

      // Handle different column types for subprocessors
      if (sortKey.includes("company") || sortKey.includes("name")) {
        aValue = a.name?.toLowerCase() || "";
        bValue = b.name?.toLowerCase() || "";
      } else if (sortKey.includes("url")) {
        aValue = a.url?.toLowerCase() || "";
        bValue = b.url?.toLowerCase() || "";
      } else if (sortKey.includes("purpose")) {
        aValue = a.purpose?.toLowerCase() || "";
        bValue = b.purpose?.toLowerCase() || "";
      } else if (sortKey.includes("location")) {
        aValue = a.location?.toLowerCase() || "";
        bValue = b.location?.toLowerCase() || "";
      } else {
        // Try to handle unknown columns by checking if they're properties of the item
        if (sortKey && sortKey in a && sortKey in b) {
          const aVal = (a as Record<string, unknown>)[sortKey];
          const bVal = (b as Record<string, unknown>)[sortKey];
          aValue = String(aVal).toLowerCase();
          bValue = String(bVal).toLowerCase();
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === "asc" ? comparison : -comparison;
        }
        return 0;
      }

      // Handle string comparisons
      const comparison = aValue.localeCompare(bValue);
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [data?.subprocessor, sortConfig]);

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!data || !data.subprocessor || data.subprocessor.length === 0)
    return <Typography>No subprocessors available.</Typography>;

  return (
    <Box width="100%">
      <Typography
        variant="subtitle2"
        color={brand.primary}
        sx={{ fontWeight: 600, mb: 2 }}
      >
        Subprocessors
      </Typography>
      <TableContainer
        component={Paper}
        sx={{ border: "1px solid #EEEEEE", borderRadius: 1, boxShadow: "none" }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ background: "#FAFAFA" }}>
              <TableCell
                sx={{
                  fontWeight: 400,
                  color: `${text.icon}`,
                  fontSize: 12,
                  textTransform: "uppercase",
                  px: 4,
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }}
                onClick={() => handleSort("company name")}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  company name
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        sortConfig.key === "company name"
                          ? "#1976D2"
                          : `${text.disabled}`,
                    }}
                  >
                    {sortConfig.key === "company name" &&
                      sortConfig.direction === "asc" && <ChevronUp size={16} />}
                    {sortConfig.key === "company name" &&
                      sortConfig.direction === "desc" && (
                        <ChevronDown size={16} />
                      )}
                    {sortConfig.key !== "company name" && (
                      <ChevronsUpDown size={16} />
                    )}
                  </Box>
                </Box>
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 400,
                  color: `${text.icon}`,
                  fontSize: 12,
                  textTransform: "uppercase",
                  px: 4,
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }}
                onClick={() => handleSort("url")}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  url
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: sortConfig.key === "url" ? "#1976D2" : `${text.disabled}`,
                    }}
                  >
                    {sortConfig.key === "url" &&
                      sortConfig.direction === "asc" && <ChevronUp size={16} />}
                    {sortConfig.key === "url" &&
                      sortConfig.direction === "desc" && (
                        <ChevronDown size={16} />
                      )}
                    {sortConfig.key !== "url" && <ChevronsUpDown size={16} />}
                  </Box>
                </Box>
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 400,
                  color: `${text.icon}`,
                  fontSize: 12,
                  textTransform: "uppercase",
                  px: 4,
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }}
                onClick={() => handleSort("purpose")}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  purpose
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        sortConfig.key === "purpose" ? "#1976D2" : `${text.disabled}`,
                    }}
                  >
                    {sortConfig.key === "purpose" &&
                      sortConfig.direction === "asc" && <ChevronUp size={16} />}
                    {sortConfig.key === "purpose" &&
                      sortConfig.direction === "desc" && (
                        <ChevronDown size={16} />
                      )}
                    {sortConfig.key !== "purpose" && (
                      <ChevronsUpDown size={16} />
                    )}
                  </Box>
                </Box>
              </TableCell>
              <TableCell
                sx={{
                  fontWeight: 400,
                  color: `${text.icon}`,
                  fontSize: 12,
                  textTransform: "uppercase",
                  px: 4,
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                  },
                }}
                onClick={() => handleSort("location")}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  location
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color:
                        sortConfig.key === "location" ? "#1976D2" : `${text.disabled}`,
                    }}
                  >
                    {sortConfig.key === "location" &&
                      sortConfig.direction === "asc" && <ChevronUp size={16} />}
                    {sortConfig.key === "location" &&
                      sortConfig.direction === "desc" && (
                        <ChevronDown size={16} />
                      )}
                    {sortConfig.key !== "location" && (
                      <ChevronsUpDown size={16} />
                    )}
                  </Box>
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedSubprocessors.map((sp: any, idx: number) => (
              <TableRow key={idx}>
                <TableCell
                  sx={{
                    ...aiTrustCenterTableCell,
                    backgroundColor: sortConfig.key === "company name" ? "#e8e8e8" : "#fafafa",
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    {sp.name}
                  </Typography>
                </TableCell>
                <TableCell
                  sx={{
                    ...aiTrustCenterTableCell,
                    backgroundColor: sortConfig.key === "url" ? `${background.surface}` : "inherit",
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    {sp.url}
                  </Typography>
                </TableCell>
                <TableCell
                  sx={{
                    ...aiTrustCenterTableCell,
                    backgroundColor: sortConfig.key === "purpose" ? `${background.surface}` : "inherit",
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    {sp.purpose}
                  </Typography>
                </TableCell>
                <TableCell
                  sx={{
                    ...aiTrustCenterTableCell,
                    backgroundColor: sortConfig.key === "location" ? `${background.surface}` : "inherit",
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    {sp.location}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default Subprocessors;
