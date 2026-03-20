import {
  Stack,
  Typography,
  useTheme,
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import { useState, useEffect, useMemo } from "react";
import { getAllLogs } from "../../../../application/repository/logs.repository";
import LogsTable from "../../../components/Table/LogsTable";
import { EmptyState } from "../../../components/EmptyState";
import { RefreshCw as RefreshIcon, ScrollText, Activity, AlertCircle, Search } from "lucide-react";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import SearchBox from "../../../components/Search/SearchBox";
import Select from "../../../components/Inputs/Select";
import { border as borderPalette } from "../../../themes/palette";

const WatchTowerLogs = () => {
  const theme = useTheme();
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logsInfo, setLogsInfo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await getAllLogs({ routeUrl: "/logger/logs" });
      const logsData = response.data;

      if (logsData?.success && logsData?.data) {
        // Sort logs in descending order (most recent first)
        const sortedLogs = [...logsData.data].reverse();
        setLogs(sortedLogs);
        setLogsInfo(logsData.message);
      } else if (logsData?.success === false) {
        setError(logsData.message || "No logs available for today");
        setLogs([]);
      } else {
        setError("Failed to load logs. Please try again later.");
        setLogs([]);
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
      setError("Failed to load logs. Please try again later.");
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleRefresh = () => {
    fetchLogs();
  };

  // Filter logs based on search query and state filter
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((line) => line.toLowerCase().includes(query));
    }

    // Apply state filter
    if (stateFilter && stateFilter !== "all") {
      result = result.filter((line) => {
        const lowerLine = line.toLowerCase();
        if (stateFilter === "successful") {
          return (
            lowerLine.includes("successful") || lowerLine.includes("success")
          );
        }
        return lowerLine.includes(stateFilter.toLowerCase());
      });
    }

    return result;
  }, [logs, searchQuery, stateFilter]);

  // State filter options
  const stateOptions = [
    { _id: "all", name: "All states" },
    { _id: "successful", name: "Successful" },
    { _id: "processing", name: "Processing" },
    { _id: "error", name: "Error" },
    { _id: "info", name: "Info" },
    { _id: "warn", name: "Warning" },
  ];

  if (isLoading) {
    return (
      <Stack className="watch-tower-logs" spacing={theme.spacing(4)}>
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{
            border: `1px solid ${borderPalette.dark}`,
            borderRadius: "4px",
            padding: theme.spacing(15, 5),
            minHeight: 200,
          }}
        >
          <Typography>Loading logs...</Typography>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack className="watch-tower-logs" spacing={theme.spacing(4)}>
      {error && (
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.error.contrastText,
            backgroundColor: theme.palette.error.light,
            padding: theme.spacing(2),
            borderRadius: theme.shape.borderRadius,
          }}
        >
          {error}
        </Typography>
      )}

      {/* Header with search, filter, and refresh */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.spacing(2),
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "center", gap: theme.spacing(2) }}
        >
          <SearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search logs..."
          />
          <Select
            id="state-filter"
            value={stateFilter}
            onChange={(e) => setStateFilter(String(e.target.value))}
            items={stateOptions}
            sx={{
              minWidth: 140,
              "& .MuiOutlinedInput-root": {
                height: 34,
              },
            }}
          />
        </Box>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: theme.spacing(2) }}
        >
          <Typography
            variant="body2"
            sx={{
              fontSize: "12px",
              color: theme.palette.text.secondary,
            }}
          >
            {logsInfo || `${filteredLogs.length} log entries`}
          </Typography>
          <Tooltip
            title="Refresh logs"
            disableInteractive
            sx={{ fontSize: 13 }}
          >
            {isLoading ? (
              <span style={{ display: "inline-block" }}>
                <IconButton
                  disableRipple={
                    theme.components?.MuiIconButton?.defaultProps?.disableRipple
                  }
                  onClick={handleRefresh}
                  disabled={isLoading}
                  sx={{
                    "&:focus": { outline: "none" },
                    "&:hover": {
                      backgroundColor: theme.palette.grey[100],
                    },
                    "&:disabled svg": {
                      color: theme.palette.action.disabled,
                    },
                  }}
                >
                  <RefreshIcon size={16} color={theme.palette.text.disabled} />
                </IconButton>
              </span>
            ) : (
              <IconButton
                disableRipple={
                  theme.components?.MuiIconButton?.defaultProps?.disableRipple
                }
                onClick={handleRefresh}
                disabled={isLoading}
                sx={{
                  "&:focus": { outline: "none" },
                  "&:hover": {
                    backgroundColor: theme.palette.grey[100],
                  },
                  "&:disabled svg": {
                    color: theme.palette.action.disabled,
                  },
                }}
              >
                <RefreshIcon size={16} color={theme.palette.text.disabled} />
              </IconButton>
            )}
          </Tooltip>
        </Box>
      </Box>

      {filteredLogs.length > 0 ? (
        <LogsTable data={filteredLogs} isLoading={isLoading} paginated={true} />
      ) : !error ? (
        <EmptyState icon={ScrollText} message="There are currently no logs available.">
          <EmptyStateTip
            icon={Activity}
            title="What appears here"
            description="System events, API calls, and background job results are logged automatically. Logs appear as your workspace generates activity."
          />
          <EmptyStateTip
            icon={AlertCircle}
            title="Monitor for issues"
            description="Watch for error-level entries that may indicate failed operations, authentication problems, or service disruptions."
          />
          <EmptyStateTip
            icon={Search}
            title="Search and filter"
            description="Use the search bar and level filters above to find specific log entries. Filter by severity to focus on warnings or errors."
          />
        </EmptyState>
      ) : null}
    </Stack>
  );
};

export default WatchTowerLogs;
