import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
} from "@mui/material";
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  FlaskConical,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Alert from "../../components/Alert";
import {
  getCcmControlTests,
  getCcmConnectors,
  createCcmControlTest,
  updateCcmControlTest,
  deleteCcmControlTest,
  runCcmControlTest,
} from "../../../application/repository/ccm.repository";
import type { CcmControlTest, CcmConnector } from "../../../application/repository/ccm.repository";

const CCMTests: React.FC = () => {
  const [tests, setTests] = useState<CcmControlTest[]>([]);
  const [connectors, setConnectors] = useState<CcmConnector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<CcmControlTest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runningTestId, setRunningTestId] = useState<number | null>(null);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "info";
    title: string;
  } | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formConnectorId, setFormConnectorId] = useState("");
  const [formQueryTemplate, setFormQueryTemplate] = useState("");
  const [formExpectationType, setFormExpectationType] = useState("count_greater_than");
  const [formExpectationConfig, setFormExpectationConfig] = useState("{}");
  const [formSchedule, setFormSchedule] = useState("0 */6 * * *");
  const [formIsActive, setFormIsActive] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [testsRes, connectorsRes] = await Promise.all([
        getCcmControlTests(),
        getCcmConnectors(),
      ]);
      setTests(testsRes);
      setConnectors(connectorsRes);
    } catch (err) {
      console.error("Error fetching control tests:", err);
      setAlert({ variant: "error", title: "Failed to load control tests" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormConnectorId("");
    setFormQueryTemplate("");
    setFormExpectationType("count_greater_than");
    setFormExpectationConfig("{}");
    setFormSchedule("0 */6 * * *");
    setFormIsActive(true);
    setEditingTest(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (test: CcmControlTest) => {
    setEditingTest(test);
    setFormName(test.name);
    setFormDescription(test.description || "");
    setFormConnectorId(String(test.connector_id));
    setFormQueryTemplate(test.query_template);
    setFormExpectationType(test.expectation_type);
    setFormExpectationConfig(JSON.stringify(test.expectation_config || {}, null, 2));
    setFormSchedule(test.schedule);
    setFormIsActive(test.is_active);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formConnectorId || !formQueryTemplate.trim()) {
      setAlert({ variant: "error", title: "Name, connector, and query are required" });
      return;
    }

    let parsedExpectationConfig: Record<string, unknown> = {};
    try {
      parsedExpectationConfig = JSON.parse(formExpectationConfig);
    } catch {
      setAlert({ variant: "error", title: "Expectation config must be valid JSON" });
      return;
    }

    const connector = connectors.find((c) => c.id === Number(formConnectorId));

    const payload = {
      name: formName,
      description: formDescription,
      connector_id: Number(formConnectorId),
      connector_type: connector?.type || "",
      query_template: formQueryTemplate,
      expectation_type: formExpectationType,
      expectation_config: parsedExpectationConfig,
      schedule: formSchedule,
      is_active: formIsActive,
    };

    setIsSubmitting(true);
    try {
      if (editingTest) {
        await updateCcmControlTest(editingTest.id, payload);
        setAlert({ variant: "success", title: "Test updated" });
      } else {
        await createCcmControlTest(payload);
        setAlert({ variant: "success", title: "Test created" });
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error("Error saving test:", err);
      setAlert({ variant: "error", title: "Failed to save test" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this test?")) return;
    try {
      await deleteCcmControlTest(id);
      setAlert({ variant: "success", title: "Test deleted" });
      fetchData();
    } catch (err) {
      console.error("Error deleting test:", err);
      setAlert({ variant: "error", title: "Failed to delete test" });
    }
  };

  const handleRun = async (id: number) => {
    setRunningTestId(id);
    try {
      await runCcmControlTest(id);
      setAlert({ variant: "success", title: "Test executed successfully" });
      fetchData();
    } catch (err) {
      console.error("Error running test:", err);
      setAlert({ variant: "error", title: "Failed to run test" });
    } finally {
      setRunningTestId(null);
    }
  };

  const getConnectorName = (id: number) => {
    const c = connectors.find((conn) => conn.id === id);
    return c?.name || `Connector ${id}`;
  };

  return (
    <PageHeaderExtended
      title="Control Tests"
      description="Configure and manage automated control tests."
      actionButton={
        <CustomizableButton
          variant="contained"
          text="Add test"
          icon={<Plus size={16} />}
          onClick={openCreateModal}
        />
      }
    >
      {alert && (
        <Box sx={{ mb: 2 }}>
          <Alert variant={alert.variant} title={alert.title} isToast onClick={() => setAlert(null)} />
        </Box>
      )}

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : tests.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <FlaskConical size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
          <Typography variant="h6" color="text.secondary">
            No control tests yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Add a test to automatically verify your controls.
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Connector</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tests.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {t.name}
                    </Typography>
                    {t.description && (
                      <Typography variant="caption" color="text.secondary">
                        {t.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{getConnectorName(t.connector_id)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={t.schedule} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={t.is_active ? "success" : "default"}
                      label={t.is_active ? "Active" : "Inactive"}
                      icon={t.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                    />
                  </TableCell>
                  <TableCell>
                    {t.last_run_at ? new Date(t.last_run_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Run now">
                      <IconButton
                        size="small"
                        onClick={() => handleRun(t.id)}
                        disabled={runningTestId === t.id}
                      >
                        {runningTestId === t.id ? (
                          <CircularProgress size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEditModal(t)}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(t.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <StandardModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingTest ? "Edit Control Test" : "Add Control Test"}
        description="Configure an automated control test."
        onSubmit={handleSave}
        submitButtonText={editingTest ? "Update" : "Create"}
        isSubmitting={isSubmitting}
      >
        <Stack spacing={3} sx={{ mt: 2 }}>
          <TextField
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            select
            label="Connector"
            value={formConnectorId}
            onChange={(e) => setFormConnectorId(e.target.value)}
            fullWidth
            required
          >
            {connectors.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name} ({c.type})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Query Template"
            value={formQueryTemplate}
            onChange={(e) => setFormQueryTemplate(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="SELECT COUNT(*) FROM events WHERE ..."
            helperText="The query or API call template to execute"
            required
          />
          <TextField
            select
            label="Expectation Type"
            value={formExpectationType}
            onChange={(e) => setFormExpectationType(e.target.value)}
            fullWidth
          >
            <MenuItem value="count_greater_than">Count Greater Than</MenuItem>
            <MenuItem value="count_less_than">Count Less Than</MenuItem>
            <MenuItem value="count_equals">Count Equals</MenuItem>
            <MenuItem value="not_empty">Not Empty</MenuItem>
            <MenuItem value="contains">Contains</MenuItem>
            <MenuItem value="custom">Custom</MenuItem>
          </TextField>
          <TextField
            label="Expectation Config (JSON)"
            value={formExpectationConfig}
            onChange={(e) => setFormExpectationConfig(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder='{"threshold": 0}'
            helperText="Enter expectation configuration as JSON"
          />
          <TextField
            label="Schedule (cron)"
            value={formSchedule}
            onChange={(e) => setFormSchedule(e.target.value)}
            fullWidth
            placeholder="0 */6 * * *"
            helperText="Cron expression for test execution frequency"
          />
          <FormControlLabel
            control={
              <Switch checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} />
            }
            label="Active"
          />
        </Stack>
      </StandardModal>
    </PageHeaderExtended>
  );
};

export default CCMTests;
