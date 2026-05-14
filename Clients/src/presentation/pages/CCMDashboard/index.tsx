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
} from "@mui/material";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Plug,
  AlertTriangle,
  CheckCircle,
  Play,
  Radio,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../components/button/customizable-button";
import { StatCard } from "../../components/Cards/StatCard";
import { DashboardCard } from "../../components/Cards/DashboardCard";
import { EmptyState } from "../../components/EmptyState";
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

const CCMDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<CcmDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "info";
    title: string;
  } | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getCcmDashboard();
      setData(res);
    } catch (err) {
      console.error("Error fetching CCM dashboard:", err);
      setAlert({ variant: "error", title: "Failed to load dashboard data" });
      setShowAlert(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (alert && alert.variant !== "error") {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
        setTimeout(() => setAlert(null), 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  const handleAcknowledgeAlert = async (alertItem: CcmAlert) => {
    try {
      await updateCcmAlert(alertItem.id, { status: "acknowledged" });
      setAlert({ variant: "success", title: "Alert acknowledged" });
      fetchDashboard();
    } catch (err) {
      console.error("Error acknowledging alert:", err);
      setAlert({ variant: "error", title: "Failed to acknowledge alert" });
      setShowAlert(true);
    }
  };

  const handleRunTest = async (testId: number) => {
    try {
      await runCcmControlTest(testId);
      setAlert({ variant: "success", title: "Test executed successfully" });
      fetchDashboard();
    } catch (err) {
      console.error("Error running test:", err);
      setAlert({ variant: "error", title: "Failed to run test" });
      setShowAlert(true);
    }
  };

  return (
    <PageHeaderExtended
      title="Continuous Control Monitoring"
      description="Automated control testing, connector health, and alerting dashboard."
      actionButton={
        <Stack direction="row" gap={1}>
          <CustomizableButton
            variant="outlined"
            text="Connectors"
            onClick={() => navigate("/continuous-monitoring/connectors")}
          />
          <CustomizableButton
            variant="contained"
            text="Tests"
            onClick={() => navigate("/continuous-monitoring/tests")}
          />
        </Stack>
      }
      alert={
        alert ? (
          <Fade in={showAlert} timeout={300}>
            <Box sx={{ position: "fixed", zIndex: 9999 }}>
              <Alert
                variant={alert.variant}
                title={alert.title}
                isToast
                onClick={() => {
                  setShowAlert(false);
                  setTimeout(() => setAlert(null), 300);
                }}
              />
            </Box>
          </Fade>
        ) : undefined
      }
    >
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!isLoading && data && (
        <Stack gap={3}>
          {/* Stats Row */}
          <Stack direction="row" gap={2} flexWrap="wrap">
            <Box sx={{ flex: "1 1 200px", minWidth: 200 }}>
              <StatCard
                title="Active Tests"
                value={data.activeTests}
                Icon={Activity}
                onClick={() => navigate("/continuous-monitoring/tests")}
              />
            </Box>
            <Box sx={{ flex: "1 1 200px", minWidth: 200 }}>
              <StatCard
                title="Passing"
                value={data.passingTests}
                Icon={ShieldCheck}
              />
            </Box>
            <Box sx={{ flex: "1 1 200px", minWidth: 200 }}>
              <StatCard
                title="Failing"
                value={data.failingTests}
                Icon={ShieldAlert}
                highlight
              />
            </Box>
            <Box sx={{ flex: "1 1 200px", minWidth: 200 }}>
              <StatCard
                title="Open Alerts"
                value={data.openAlerts}
                Icon={AlertTriangle}
              />
            </Box>
          </Stack>

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
          <DashboardCard title="Recent Alerts">
            {data.recentAlerts.length === 0 ? (
              <EmptyState
                message="No recent alerts"
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
                    {data.recentAlerts.map((a: CcmAlert) => (
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
            {data.recentResults.length === 0 ? (
              <EmptyState
                message="No recent results"
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
                    {data.recentResults.map((r: CcmTestResult) => (
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
                          {r.execution_time_ms
                            ? `${r.execution_time_ms}ms`
                            : "-"}
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
      )}
    </PageHeaderExtended>
  );
};

export default CCMDashboard;
