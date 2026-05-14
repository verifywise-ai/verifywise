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
  TestTube,
  Plug,
  CheckCircle,
  XCircle,
} from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import { EmptyState } from "../../components/EmptyState";
import { SearchBox } from "../../components/Search";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import {
  getCcmConnectors,
  getCcmConnectorTypes,
  createCcmConnector,
  updateCcmConnector,
  deleteCcmConnector,
  testCcmConnector,
} from "../../../application/repository/ccm.repository";
import type { CcmConnector, ConnectorTypeInfo } from "../../../application/repository/ccm.repository";

interface ConnectorsTabProps {
  onAlert: (variant: "success" | "error" | "info", title: string) => void;
}

const DEFAULT_CONNECTOR_CONFIG = JSON.stringify(
  {
    region: "us-east-1",
    roleArn: "arn:aws:iam::123456789012:role/CCMReadOnlyRole",
  },
  null,
  2,
);

const ConnectorsTab: React.FC<ConnectorsTabProps> = ({ onAlert }) => {
  const [connectors, setConnectors] = useState<CcmConnector[]>([]);
  const [connectorTypes, setConnectorTypes] = useState<ConnectorTypeInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<CcmConnector | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CcmConnector | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("");
  const [formConfig, setFormConfig] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [connRes, typesRes] = await Promise.all([
        getCcmConnectors(),
        getCcmConnectorTypes(),
      ]);
      setConnectors(connRes);
      setConnectorTypes(typesRes);
      if (typesRes.length > 0 && !formType) {
        setFormType(typesRes[0].type);
      }
    } catch (err) {
      console.error("Error fetching connectors:", err);
      onAlert("error", "Failed to load connectors");
    } finally {
      setIsLoading(false);
    }
  }, [formType, onAlert]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setFormName("");
    setFormType(connectorTypes[0]?.type || "");
    setFormConfig("");
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
      onAlert("error", "Name and type are required");
      return;
    }

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(formConfig);
    } catch {
      onAlert("error", "Config must be valid JSON");
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
        onAlert("success", "Connector updated");
      } else {
        await createCcmConnector({
          name: formName,
          type: formType,
          config: parsedConfig,
        });
        onAlert("success", "Connector created");
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error("Error saving connector:", err);
      onAlert("error", "Failed to save connector");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCcmConnector(deleteTarget.id);
      onAlert("success", "Connector deleted");
      fetchData();
    } catch (err) {
      console.error("Error deleting connector:", err);
      onAlert("error", "Failed to delete connector");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleTest = async (id: number) => {
    try {
      const result = await testCcmConnector(id);
      onAlert(
        result.success ? "success" : "error",
        result.message || (result.success ? "Connection successful" : "Connection failed"),
      );
      fetchData();
    } catch (err) {
      console.error("Error testing connector:", err);
      onAlert("error", "Failed to test connector");
    }
  };

  const statusSx = (status?: string) => {
    switch (status) {
      case "healthy":
        return {
          bg: palette.status.success.bg,
          text: palette.status.success.text,
          border: palette.status.success.border,
        };
      case "unhealthy":
        return {
          bg: palette.status.error.bg,
          text: palette.status.error.text,
          border: palette.status.error.border,
        };
      default:
        return {
          bg: palette.status.default.bg,
          text: palette.status.default.text,
          border: palette.status.default.border,
        };
    }
  };

  const typeItems = [
    { _id: "", name: "Select connector type..." },
    ...connectorTypes.map((t) => ({
      _id: t.type,
      name: `${t.name} (${t.type})`,
    })),
  ];

  const filteredConnectors = connectors.filter((c) =>
    searchQuery
      ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.type.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  return (
    <>
      <Typography variant="body2" sx={{ color: "#475467", mb: 2 }}>
        Connectors integrate VerifyWise with your infrastructure — AWS, GitHub, or
        any API — so control tests can automatically query and validate your systems.
      </Typography>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <SearchBox
          placeholder="Search connectors..."
          value={searchQuery}
          onChange={setSearchQuery}
          fullWidth={false}
        />
        <CustomizableButton
          variant="contained"
          text="Add connector"
          icon={<Plus size={16} />}
          onClick={openCreateModal}
        />
      </Stack>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredConnectors.length === 0 ? (
        <EmptyState
          message={
            searchQuery
              ? "No connectors match your search"
              : "No connectors yet. Add a connector to start automated control monitoring."
          }
          icon={Plug}
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
                  Type
                </TableCell>
                <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                  Status
                </TableCell>
                <TableCell style={singleTheme.tableStyles.primary.header.cell}>
                  Last Health Check
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
              {filteredConnectors.map((c) => {
                const s = statusSx(c.status);
                return (
                  <TableRow
                    key={c.id}
                    sx={singleTheme.tableStyles.primary.body.row}
                  >
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {c.name}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Chip
                        size="small"
                        label={c.type}
                        variant="outlined"
                        sx={{ fontSize: "11px", height: "22px", borderRadius: "4px" }}
                      />
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      <Chip
                        size="small"
                        label={c.status || "unknown"}
                        icon={
                          c.status === "healthy" ? (
                            <CheckCircle size={14} />
                          ) : c.status === "unhealthy" ? (
                            <XCircle size={14} />
                          ) : undefined
                        }
                        sx={{
                          backgroundColor: s.bg,
                          color: s.text,
                          border: `1px solid ${s.border}`,
                          fontSize: "11px",
                          fontWeight: 500,
                          borderRadius: "4px",
                          height: "22px",
                        }}
                      />
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {c.last_health_check_at
                        ? new Date(c.last_health_check_at).toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell
                      sx={singleTheme.tableStyles.primary.body.cell}
                      align="right"
                    >
                      <Tooltip title={c.status === "error" ? "Connector is in error state — test connection to diagnose" : "Test connection"}>
                        <IconButton size="small" onClick={() => handleTest(c.id)}>
                          <TestTube size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit connector">
                        <IconButton
                          size="small"
                          onClick={() => openEditModal(c)}
                        >
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete connector">
                        <IconButton
                          size="small"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
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
        <Stack spacing={6} sx={{ mt: 2 }}>
          <Field
            id="connector-name"
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g., AWS Production Account"
            isRequired
          />
          <Select
            id="connector-type"
            label="Type"
            value={formType}
            items={typeItems}
            onChange={(e) => setFormType(e.target.value as string)}
            getOptionValue={(item) => item._id as string}
            isRequired
          />
          <Field
            id="connector-config"
            label="Config (JSON)"
            value={formConfig}
            onChange={(e) => setFormConfig(e.target.value)}
            placeholder='{"region": "us-east-1"}'
            helperText="Enter connector configuration as JSON"
            multiline
            rows={6}
          />
        </Stack>
      </StandardModal>

      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Connector"
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
    </>
  );
};

export default ConnectorsTab;
