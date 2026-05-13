import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Plug,
  AlertTriangle,
  CheckCircle,
  Play,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../components/button/customizable-button";
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

const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}> = ({ title, value, icon, color, onClick }) => (
  <Card
    variant="outlined"
    sx={{
      cursor: onClick ? "pointer" : "default",
      transition: "box-shadow 0.2s",
      "&:hover": onClick ? { boxShadow: 2 } : {},
    }}
    onClick={onClick}
  >
    <CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
          <Typography variant="h4" sx={{ mt: 1, fontWeight: 600 }}>
            {value}
          </Typography>
        </Box>
        <Box sx={{ color }}>{icon}</Box>
      </Stack>
    </CardContent>
  </Card>
);

const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const colorMap: Record<string, "success" | "error" | "warning" | "default"> = {
    pass: "success",
    fail: "error",
    error: "warning",
    open: "error",
    acknowledged: "warning",
    resolved: "success",
  };
  return <Chip size="small" color={colorMap[status] || "default"} label={status} />;
};

const CCMDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<CcmDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "info";
    title: string;
  } | null>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getCcmDashboard();
      setData(res);
    } catch (err) {
      console.error("Error fetching CCM dashboard:", err);
      setAlert({ variant: "error", title: "Failed to load dashboard data" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleAcknowledgeAlert = async (alertItem: CcmAlert) => {
    try {
      await updateCcmAlert(alertItem.id, { status: "acknowledged" });
      setAlert({ variant: "success", title: "Alert acknowledged" });
      fetchDashboard();
    } catch (err) {
      console.error("Error acknowledging alert:", err);
      setAlert({ variant: "error", title: "Failed to acknowledge alert" });
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
    >
      {alert && (
        <Box sx={{ mb: 2 }}>
          <Alert variant={alert.variant} title={alert.title} isToast onClick={() => setAlert(null)} />
        </Box>
      )}

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!isLoading && data && (
        <Stack gap={3}>
          {/* Stats Row */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Active Tests"
                value={data.activeTests}
                icon={<Activity size={28} />}
                color="primary.main"
                onClick={() => navigate("/continuous-monitoring/tests")}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Passing"
                value={data.passingTests}
                icon={<ShieldCheck size={28} />}
                color="success.main"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Failing"
                value={data.failingTests}
                icon={<ShieldAlert size={28} />}
                color="error.main"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Open Alerts"
                value={data.openAlerts}
                icon={<AlertTriangle size={28} />}
                color="warning.main"
              />
            </Grid>
          </Grid>

          {/* Connectors summary */}
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
                <Plug size={18} />
                <Typography variant="h6">Connectors</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {data.healthyConnectors} of {data.connectorCount} connectors are healthy
              </Typography>
            </CardContent>
          </Card>

          {/* Recent Alerts */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Recent Alerts
              </Typography>
              {data.recentAlerts.length === 0 ? (
                <Typography color="text.secondary">No recent alerts</Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Severity</TableCell>
                        <TableCell>Message</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.recentAlerts.map((a: CcmAlert) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <Chip
                              size="small"
                              color={
                                a.severity === "critical"
                                  ? "error"
                                  : a.severity === "warning"
                                    ? "warning"
                                    : "info"
                              }
                              label={a.severity}
                            />
                          </TableCell>
                          <TableCell>{a.message}</TableCell>
                          <TableCell>
                            <StatusChip status={a.status} />
                          </TableCell>
                          <TableCell>
                            {a.created_at ? new Date(a.created_at).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell align="right">
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
            </CardContent>
          </Card>

          {/* Recent Results */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Recent Test Results
              </Typography>
              {data.recentResults.length === 0 ? (
                <Typography color="text.secondary">No recent results</Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Test ID</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Execution Time</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.recentResults.map((r: CcmTestResult) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.test_id}</TableCell>
                          <TableCell>
                            <StatusChip status={r.status} />
                          </TableCell>
                          <TableCell>
                            {r.execution_time_ms ? `${r.execution_time_ms}ms` : "-"}
                          </TableCell>
                          <TableCell>
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Re-run test">
                              <IconButton size="small" onClick={() => handleRunTest(r.test_id)}>
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
            </CardContent>
          </Card>
        </Stack>
      )}
    </PageHeaderExtended>
  );
};

export default CCMDashboard;
