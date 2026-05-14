import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Fade,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Typography,
} from "@mui/material";
import {
  Plug,
  CheckCircle,
  Play,
  Radio,
  ShieldCheck,
  ShieldAlert,
  Activity,
  AlertTriangle,
} from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import { DashboardCard } from "../../components/Cards/DashboardCard";
import { EmptyState } from "../../components/EmptyState";
import { SearchBox } from "../../components/Search";
import Alert from "../../components/Alert";
import {
  getCcmDashboard,
  updateCcmAlert,
  runCcmControlTest,
} from "../../../application/repository/ccm.repository";
import type {
  CcmDashboardSummary,
  CcmAlert,
  CcmTestResult,
} from "../../../application/repository/ccm.repository";

const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; text: string; border: string }> = {
    pass: palette.status.success,
    fail: palette.status.error,
    error: palette.status.warning,
    open: palette.status.error,
    acknowledged: palette.status.warning,
    resolved: palette.status.success,
  };
  const c = config[status] || palette.status.default;
  return (
    <Chip
      size="small"
      label={status}
      sx={{
        backgroundColor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontSize: "11px",
        fontWeight: 500,
        borderRadius: "4px",
        height: "22px",
      }}
    />
  );
};

interface DashboardTabProps {
  onAlert: (variant: "success" | "error" | "info", title: string) => void;
}

const DashboardTab: React.FC<DashboardTabProps> = ({ onAlert }) => {
  const [data, setData] = useState<CcmDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getCcmDashboard();
      setData(res);
    } catch (err) {
      console.error("Error fetching CCM dashboard:", err);
      onAlert("error", "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [onAlert]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleAcknowledgeAlert = async (alertItem: CcmAlert) => {
    try {
      await updateCcmAlert(alertItem.id, { status: "acknowledged" });
      onAlert("success", "Alert acknowledged");
      fetchDashboard();
    } catch (err) {
      console.error("Error acknowledging alert:", err);
      onAlert("error", "Failed to acknowledge alert");
    }
  };

  const handleRunTest = async (testId: number) => {
    try {
      await runCcmControlTest(testId);
      onAlert("success", "Test executed successfully");
      fetchDashboard();
    } catch (err) {
      console.error("Error running test:", err);
      onAlert("error", "Failed to run test");
    }
  };

  const filteredAlerts =
    data?.recentAlerts.filter((a) =>
      searchQuery
        ? a.message.toLowerCase().includes(searchQuery.toLowerCase())
        : true,
    ) || [];

  const filteredResults =
    data?.recentResults.filter((r) =>
      searchQuery
        ? String(r.test_id).includes(searchQuery)
        : true,
    ) || [];

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return (
      <EmptyState
        message="No dashboard data available."
        icon={Radio}
        showBorder
      />
    );
  }

  return (
    <Stack gap={3}>
      <Typography variant="body2" sx={{ color: "#475467" }}>
        Monitor the health of your automated control tests, review recent results,
        and investigate alerts — all in one place.
      </Typography>

      {/* Connectors summary */}
      <DashboardCard title="Connectors">
        <Stack direction="row" alignItems="center" gap={1}>
          <Plug size={18} color={palette.text.icon} />
          <Box sx={{ color: palette.text.secondary, fontSize: 13 }}>
            {data.healthyConnectors} of {data.connectorCount} connectors are healthy
          </Box>
        </Stack>
      </DashboardCard>

      {/* Recent Alerts */}
      <DashboardCard
        title="Recent Alerts"
        action={
          <SearchBox
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={setSearchQuery}
            fullWidth={false}
          />
        }
      >
        {filteredAlerts.length === 0 ? (
          <EmptyState
            message={searchQuery ? "No matching alerts" : "No recent alerts"}
            icon={Radio}
            showBorder
          />
        ) : (
          <TableContainer sx={singleTheme.tableStyles.primary.frame}>
            <Table size="small">
              <TableHead
                sx={{
                  backgroundColor:
                    singleTheme.tableStyles.primary.header.backgroundColors,
                }}
              >
                <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Severity
                  </TableCell>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Message
                  </TableCell>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Status
                  </TableCell>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Created
                  </TableCell>
                  <TableCell
                    style={singleTheme.tableStyles.primary.header.cell}
                    align="right"
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAlerts.map((a: CcmAlert) => (
                  <TableRow
                    key={a.id}
                    sx={singleTheme.tableStyles.primary.body.row}
                  >
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Chip
                        size="small"
                        label={a.severity}
                        sx={{
                          backgroundColor:
                            a.severity === "critical"
                              ? palette.status.error.bg
                              : a.severity === "warning"
                                ? palette.status.warning.bg
                                : palette.status.info.bg,
                          color:
                            a.severity === "critical"
                              ? palette.status.error.text
                              : a.severity === "warning"
                                ? palette.status.warning.text
                                : palette.status.info.text,
                          border: `1px solid ${a.severity === "critical" ? palette.status.error.border : a.severity === "warning" ? palette.status.warning.border : palette.status.info.border}`,
                          fontSize: "11px",
                          fontWeight: 500,
                          borderRadius: "4px",
                          height: "22px",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {a.message}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <StatusChip status={a.status} />
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {a.created_at
                        ? new Date(a.created_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell
                      sx={singleTheme.tableStyles.primary.body.cell}
                      align="right"
                    >
                      {a.status === "open" && (
                        <Tooltip title="Acknowledge">
                          <IconButton
                            size="small"
                            onClick={() => handleAcknowledgeAlert(a)}
                          >
                            <CheckCircle size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DashboardCard>

      {/* Recent Results */}
      <DashboardCard title="Recent Test Results">
        {filteredResults.length === 0 ? (
          <EmptyState
            message={searchQuery ? "No matching results" : "No recent results"}
            icon={Radio}
            showBorder
          />
        ) : (
          <TableContainer sx={singleTheme.tableStyles.primary.frame}>
            <Table size="small">
              <TableHead
                sx={{
                  backgroundColor:
                    singleTheme.tableStyles.primary.header.backgroundColors,
                }}
              >
                <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Test ID
                  </TableCell>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Status
                  </TableCell>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Execution Time
                  </TableCell>
                  <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                    Created
                  </TableCell>
                  <TableCell
                    style={singleTheme.tableStyles.primary.header.cell}
                    align="right"
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredResults.map((r: CcmTestResult) => (
                  <TableRow
                    key={r.id}
                    sx={singleTheme.tableStyles.primary.body.row}
                  >
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {r.test_id}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <StatusChip status={r.status} />
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {r.execution_time_ms ? `${r.execution_time_ms}ms` : "-"}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {r.created_at
                        ? new Date(r.created_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell
                      sx={singleTheme.tableStyles.primary.body.cell}
                      align="right"
                    >
                      <Tooltip title="Re-run test">
                        <IconButton
                          size="small"
                          onClick={() => handleRunTest(r.test_id)}
                        >
                          <Play size={16} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DashboardCard>
    </Stack>
  );
};

export default DashboardTab;
