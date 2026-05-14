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
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Typography,
} from "@mui/material";
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  FlaskConical,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import { EmptyState } from "../../components/EmptyState";
import Alert from "../../components/Alert";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Toggle from "../../components/Inputs/Toggle";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
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
  const [deleteTarget, setDeleteTarget] = useState<CcmControlTest | null>(null);

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

  const handleDelete = (test: CcmControlTest) => {
    setDeleteTarget(test);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCcmControlTest(deleteTarget.id);
      setAlert({ variant: "success", title: "Test deleted" });
      fetchData();
    } catch (err) {
      console.error("Error deleting test:", err);
      setAlert({ variant: "error", title: "Failed to delete test" });
    } finally {
      setDeleteTarget(null);
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

  const connectorItems = connectors.map((c) => ({
    _id: String(c.id),
    name: `${c.name} (${c.type})`,
  }));

  const expectationItems = [
    { _id: "count_greater_than", name: "Count Greater Than" },
    { _id: "count_less_than", name: "Count Less Than" },
    { _id: "count_equals", name: "Count Equals" },
    { _id: "not_empty", name: "Not Empty" },
    { _id: "contains", name: "Contains" },
    { _id: "custom", name: "Custom" },
  ];

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
          <Alert
            variant={alert.variant}
            title={alert.title}
            isToast
            onClick={() => setAlert(null)}
          />
        </Box>
      )}

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : tests.length === 0 ? (
        <EmptyState
          message="No control tests yet. Add a test to automatically verify your controls."
          icon={FlaskConical}
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
                  Name
                </TableCell>
                <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                  Connector
                </TableCell>
                <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                  Schedule
                </TableCell>
                <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                  Active
                </TableCell>
                <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                  Last Run
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
              {tests.map((t) => (
                <TableRow
                  key={t.id}
                  sx={singleTheme.tableStyles.primary.body.row}
                >
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography variant="body2" fontWeight={500}>
                      {t.name}
                    </Typography>
                    {t.description && (
                      <Typography variant="caption" color="text.secondary">
                        {t.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {getConnectorName(t.connector_id)}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Chip
                      size="small"
                      label={t.schedule}
                      variant="outlined"
                      sx={{ fontSize: "11px", height: "22px", borderRadius: "4px" }}
                    />
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Chip
                      size="small"
                      icon={t.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                      label={t.is_active ? "Active" : "Inactive"}
                      sx={{
                        backgroundColor: t.is_active
                          ? palette.status.success.bg
                          : palette.status.default.bg,
                        color: t.is_active
                          ? palette.status.success.text
                          : palette.status.default.text,
                        border: `1px solid ${t.is_active ? palette.status.success.border : palette.status.default.border}`,
                        fontSize: "11px",
                        fontWeight: 500,
                        borderRadius: "4px",
                        height: "22px",
                      }}
                    />
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {t.last_run_at ? new Date(t.last_run_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell
                    sx={singleTheme.tableStyles.primary.body.cell}
                    align="right"
                  >
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
                      <IconButton size="small" onClick={() => handleDelete(t)}>
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
        <Stack spacing={6} sx={{ mt: 2 }}>
          <Field
            id="test-name"
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            isRequired
          />
          <Field
            id="test-description"
            label="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            multiline
            rows={2}
          />
          <Select
            id="test-connector"
            label="Connector"
            value={formConnectorId}
            items={connectorItems}
            onChange={(e) => setFormConnectorId(e.target.value as string)}
            getOptionValue={(item) => item._id as string}
            isRequired
          />
          <Field
            id="test-query"
            label="Query Template"
            value={formQueryTemplate}
            onChange={(e) => setFormQueryTemplate(e.target.value)}
            placeholder="SELECT COUNT(*) FROM events WHERE ..."
            helperText="The query or API call template to execute"
            multiline
            rows={3}
            isRequired
          />
          <Select
            id="test-expectation"
            label="Expectation Type"
            value={formExpectationType}
            items={expectationItems}
            onChange={(e) => setFormExpectationType(e.target.value as string)}
            getOptionValue={(item) => item._id as string}
          />
          <Field
            id="test-expectation-config"
            label="Expectation Config (JSON)"
            value={formExpectationConfig}
            onChange={(e) => setFormExpectationConfig(e.target.value)}
            placeholder='{"threshold": 0}'
            helperText="Enter expectation configuration as JSON"
            multiline
            rows={3}
          />
          <Field
            id="test-schedule"
            label="Schedule (cron)"
            value={formSchedule}
            onChange={(e) => setFormSchedule(e.target.value)}
            placeholder="0 */6 * * *"
            helperText="Cron expression for test execution frequency"
          />
          <Stack direction="row" alignItems="center" gap={2}>
            <Toggle
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
            />
            <Typography variant="body2" color="text.secondary">
              Active
            </Typography>
          </Stack>
        </Stack>
      </StandardModal>

      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Control Test"
        body={
          <span>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            This action cannot be undone.
          </span>
        }
        cancelText="Cancel"
        proceedText="Delete"
        proceedButtonVariant="contained"
        proceedButtonColor="error"
        onCancel={() => setDeleteTarget(null)}
        onProceed={confirmDelete}
      />
    </PageHeaderExtended>
  );
};

export default CCMTests;
