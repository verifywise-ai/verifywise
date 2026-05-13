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
} from "@mui/material";
import {
  Plus,
  Pencil,
  Trash2,
  TestTube,
  Plug,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Alert from "../../components/Alert";
import {
  getCcmConnectors,
  getCcmConnectorTypes,
  createCcmConnector,
  updateCcmConnector,
  deleteCcmConnector,
  testCcmConnector,
} from "../../../application/repository/ccm.repository";
import type { CcmConnector, ConnectorTypeInfo } from "../../../application/repository/ccm.repository";

const CCMConnectors: React.FC = () => {
  const [connectors, setConnectors] = useState<CcmConnector[]>([]);
  const [connectorTypes, setConnectorTypes] = useState<ConnectorTypeInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<CcmConnector | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "info";
    title: string;
  } | null>(null);

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("");
  const [formConfig, setFormConfig] = useState("{}");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [connRes, typesRes] = await Promise.all([
        getCcmConnectors(),
        getCcmConnectorTypes(),
      ]);
      setConnectors(connRes);
      setConnectorTypes(typesRes);
    } catch (err) {
      console.error("Error fetching connectors:", err);
      setAlert({ variant: "error", title: "Failed to load connectors" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setFormName("");
    setFormType("");
    setFormConfig("{}");
    setEditingConnector(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (connector: CcmConnector) => {
    setEditingConnector(connector);
    setFormName(connector.name);
    setFormType(connector.type);
    setFormConfig(JSON.stringify(connector.config || {}, null, 2));
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formType) {
      setAlert({ variant: "error", title: "Name and type are required" });
      return;
    }

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(formConfig);
    } catch {
      setAlert({ variant: "error", title: "Config must be valid JSON" });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingConnector) {
        await updateCcmConnector(editingConnector.id, {
          name: formName,
          type: formType,
          config: parsedConfig,
        });
        setAlert({ variant: "success", title: "Connector updated" });
      } else {
        await createCcmConnector({
          name: formName,
          type: formType,
          config: parsedConfig,
        });
        setAlert({ variant: "success", title: "Connector created" });
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error("Error saving connector:", err);
      setAlert({ variant: "error", title: "Failed to save connector" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this connector?")) return;
    try {
      await deleteCcmConnector(id);
      setAlert({ variant: "success", title: "Connector deleted" });
      fetchData();
    } catch (err) {
      console.error("Error deleting connector:", err);
      setAlert({ variant: "error", title: "Failed to delete connector" });
    }
  };

  const handleTest = async (id: number) => {
    try {
      const result = await testCcmConnector(id);
      setAlert({
        variant: result.success ? "success" : "error",
        title: result.message || (result.success ? "Connection successful" : "Connection failed"),
      });
      fetchData();
    } catch (err) {
      console.error("Error testing connector:", err);
      setAlert({ variant: "error", title: "Failed to test connector" });
    }
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case "healthy":
        return "success";
      case "unhealthy":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <PageHeaderExtended
      title="CCM Connectors"
      description="Manage data connectors for automated control testing."
      actionButton={
        <CustomizableButton
          variant="contained"
          text="Add connector"
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
      ) : connectors.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Plug size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
          <Typography variant="h6" color="text.secondary">
            No connectors yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Add a connector to start automated control monitoring.
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Health Check</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connectors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={c.type} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={statusColor(c.status) as any}
                      label={c.status || "unknown"}
                      icon={
                        c.status === "healthy" ? (
                          <CheckCircle size={14} />
                        ) : c.status === "unhealthy" ? (
                          <XCircle size={14} />
                        ) : undefined
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {c.last_health_check_at
                      ? new Date(c.last_health_check_at).toLocaleString()
                      : "-"}
                  </TableCell>
                  <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Test connection">
                      <IconButton size="small" onClick={() => handleTest(c.id)}>
                        <TestTube size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEditModal(c)}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(c.id)}>
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
        title={editingConnector ? "Edit Connector" : "Add Connector"}
        description="Configure a connector for automated control testing."
        onSubmit={handleSave}
        submitButtonText={editingConnector ? "Update" : "Create"}
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
            select
            label="Type"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            fullWidth
            required
          >
            {connectorTypes.map((t) => (
              <MenuItem key={t.type} value={t.type}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Config (JSON)"
            value={formConfig}
            onChange={(e) => setFormConfig(e.target.value)}
            fullWidth
            multiline
            rows={6}
            placeholder='{"region": "us-east-1"}'
            helperText="Enter connector configuration as JSON"
          />
        </Stack>
      </StandardModal>
    </PageHeaderExtended>
  );
};

export default CCMConnectors;
