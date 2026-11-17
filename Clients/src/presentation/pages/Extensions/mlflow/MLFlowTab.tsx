/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  CardContent,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  TablePagination,
  Chip,
} from "@mui/material";
import { RefreshCw, Eye, ChevronsUpDown } from "lucide-react";
import { colors, typography, borderRadius, cardStyles, tableStyles, chipStyles } from "../theme";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getApiErrorReason } from "../../../../application/utils/apiErrorReason";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { pageOfLabel } from "../../../components/Table/pageOfLabel";
import { palette, radiusPx } from "../../../themes/palette";
import { useCan } from "../../../../application/hooks/useCan";
import ExtensionSetupNotice from "../ExtensionSetupNotice";
import Alert from "../../../components/Alert";
import StandardModal from "../../../components/Modals/StandardModal";
import { CustomizableButton } from "../../../components/button/customizable-button";

const SelectorVertical = (props: any) => <ChevronsUpDown size={16} {...props} />;

const sectionTitleSx = { fontWeight: typography.weights.semibold, mb: "2px" };
const detailListSx = { display: "flex", flexDirection: "column", gap: "2px" } as const;

interface MLFlowModel {
  id: number;
  model_name: string;
  version: string;
  lifecycle_stage: string;
  status?: string;
  run_id: string;
  experiment_id?: string;
  experiment_name?: string;
  description?: string;
  creation_timestamp: number;
  last_updated_timestamp: number;
  artifact_location?: string;
  tags?: Record<string, string>;
  metrics?: Record<string, number>;
  parameters?: Record<string, string>;
}

export default function MLFlowTab() {
  const formatDate = useFormattedDate();
  // Sync writes model records, so the server requires model.edit for it.
  const canSync = useCan("model.edit");
  const [loading, setLoading] = useState(false);
  // The server's reason stays out of the static title so "Sync failed"
  // translates on its own.
  const [warning, setWarning] = useState<{ title?: string; body: string } | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [selectedModel, setSelectedModel] = useState<MLFlowModel | null>(null);
  const [mlflowData, setMlflowData] = useState<MLFlowModel[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const summaryStats = useMemo(() => {
    const stageCounts = mlflowData.reduce(
      (acc, model) => {
        const stage = (model.lifecycle_stage || "").toLowerCase();
        if (stage === "production") acc.active += 1;
        else if (stage === "staging") acc.staging += 1;
        else if (stage === "archived") acc.archived += 1;
        return acc;
      },
      { active: 0, staging: 0, archived: 0 },
    );

    const experiments = new Set(mlflowData.map((model) => model.experiment_id).filter(Boolean))
      .size;

    return {
      total: mlflowData.length,
      active: stageCounts.active,
      staging: stageCounts.staging,
      archived: stageCounts.archived,
      experiments,
    };
  }, [mlflowData]);

  const fetchMLFlowData = async () => {
    setLoading(true);
    setWarning(null);
    setNotConfigured(false);
    try {
      const response = await apiServices.get("/extensions/mlflow/models");
      const payload = (response.data as any)?.data;
      if (payload && "models" in payload && Array.isArray(payload.models)) {
        if (!payload.configured) {
          setNotConfigured(true);
        } else if (payload.connected === false) {
          setWarning({ body: payload.message || "MLflow server is not reachable." });
        } else if (payload.error) {
          setWarning({ body: payload.error });
        }
        setMlflowData(payload.models);
      } else {
        setMlflowData([]);
      }
    } catch {
      setWarning({ body: "Unable to reach the MLflow backend." });
      setMlflowData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMLFlowData();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    setWarning(null);
    try {
      await apiServices.post("/extensions/mlflow/sync", {});
      await fetchMLFlowData();
    } catch (error: any) {
      await fetchMLFlowData();
      const reason = getApiErrorReason(error);
      if (reason) {
        setWarning({ title: "Sync failed", body: reason });
      } else {
        setWarning({ body: "Failed to sync with MLflow server. Showing cached data." });
      }
    }
  };

  const handleModelClick = (model: MLFlowModel) => setSelectedModel(model);
  const handleCloseModal = () => setSelectedModel(null);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleRowsPerPageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  const getRange = useMemo(() => {
    if (!mlflowData.length) return "0 - 0";
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, mlflowData.length);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, mlflowData.length]);

  const displayData = mlflowData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (loading && mlflowData.length === 0) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "400px" }}
      >
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: "4px" }}>
          Loading MLflow data...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: "6px", maxWidth: "100%", overflowX: "hidden" }}>
      {notConfigured && (
        <ExtensionSetupNotice
          extensionKey="mlflow"
          adminText="Configure the MLflow extension to start syncing live data."
          askAdminText="Ask an Admin to set up MLflow."
        />
      )}
      {warning && (
        <Alert
          variant="warning"
          inline
          title={warning.title}
          body={warning.body}
          sx={{ mb: "16px" }}
        />
      )}

      {canSync && (
        <Box
          sx={{
            mb: "4px",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "4px",
            width: "100%",
          }}
        >
          <CustomizableButton
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={handleRefresh}
            isDisabled={loading}
            text="Sync"
            testId="mlflow-sync"
          />
        </Box>
      )}

      <Box sx={{ display: "flex", gap: "4px", mb: "8px", flexWrap: "wrap" }}>
        <Card sx={{ flex: "1 1 200px", minWidth: 150, ...cardStyles.base }}>
          <CardContent>
            <Typography
              variant="body2"
              sx={{ color: colors.textTertiary, fontSize: typography.sizes.md }}
            >
              Models
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}
            >
              {summaryStats.total}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: "1 1 200px", minWidth: 150, ...cardStyles.base }}>
          <CardContent>
            <Typography
              variant="body2"
              sx={{ color: colors.textTertiary, fontSize: typography.sizes.md }}
            >
              Active
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}
            >
              {summaryStats.active}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: "1 1 200px", minWidth: 150, ...cardStyles.base }}>
          <CardContent>
            <Typography
              variant="body2"
              sx={{ color: colors.textTertiary, fontSize: typography.sizes.md }}
            >
              Staging
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}
            >
              {summaryStats.staging}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: "1 1 200px", minWidth: 150, ...cardStyles.base }}>
          <CardContent>
            <Typography
              variant="body2"
              sx={{ color: colors.textTertiary, fontSize: typography.sizes.md }}
            >
              Experiments
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}
            >
              {summaryStats.experiments}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ mt: "16px", mb: "4px" }}>
        {mlflowData.length === 0 && !loading ? (
          <Box sx={{ textAlign: "center", py: "8px", color: colors.textTertiary }}>
            <Typography sx={{ fontSize: typography.sizes.md }}>
              {canSync
                ? "No MLflow models have been synced yet. Configure the integration and click Sync to pull the latest models."
                : "No MLflow models have been synced yet."}
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md,
            }}
          >
            <Table sx={{ minWidth: 800 }}>
              <TableHead sx={{ backgroundColor: colors.backgroundSecondary }}>
                <TableRow>
                  {[
                    "Model name",
                    "Version",
                    "Status",
                    "Created",
                    "Last updated",
                    "Description",
                    "Actions",
                  ].map((header) => (
                    <TableCell key={header} sx={tableStyles.header}>
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {displayData.map((model) => (
                  <TableRow
                    key={model.id}
                    sx={{ ...tableStyles.row, cursor: "pointer" }}
                    onClick={() => handleModelClick(model)}
                  >
                    <TableCell sx={tableStyles.cell}>{model.model_name}</TableCell>
                    <TableCell sx={tableStyles.cell}>{model.version}</TableCell>
                    <TableCell sx={tableStyles.cell}>
                      <Chip
                        label={model.lifecycle_stage}
                        size="small"
                        sx={{
                          ...chipStyles.base,
                          ...(model.lifecycle_stage.toLowerCase() === "production"
                            ? chipStyles.success
                            : model.lifecycle_stage.toLowerCase() === "staging"
                              ? chipStyles.warning
                              : chipStyles.neutral),
                        }}
                      />
                    </TableCell>
                    <TableCell sx={tableStyles.cell}>
                      {formatDate(new Date(model.creation_timestamp))}
                    </TableCell>
                    <TableCell sx={tableStyles.cell}>
                      {formatDate(new Date(model.last_updated_timestamp))}
                    </TableCell>
                    <TableCell
                      sx={{
                        ...tableStyles.cell,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {model.description || "No description"}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: "2px" }}>
                        <Tooltip title="View details">
                          <IconButton size="small" sx={{ mr: "2px" }}>
                            <Eye size={16} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {mlflowData.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontSize: typography.sizes.md,
                        color: colors.textTertiary,
                      }}
                    >
                      Showing {getRange} of {mlflowData.length} model(s)
                    </TableCell>
                    <TablePagination
                      count={mlflowData.length}
                      page={page}
                      onPageChange={handleChangePage}
                      rowsPerPage={rowsPerPage}
                      rowsPerPageOptions={[5, 10, 15, 25]}
                      onRowsPerPageChange={handleRowsPerPageChange}
                      labelRowsPerPage="Rows per page"
                      labelDisplayedRows={({ page, count }) =>
                        pageOfLabel(page + 1, Math.max(1, Math.ceil(count / rowsPerPage)))
                      }
                      slotProps={{ select: { IconComponent: SelectorVertical } }}
                      sx={{ fontSize: typography.sizes.md }}
                    />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </TableContainer>
        )}
      </Box>

      <StandardModal
        isOpen={selectedModel !== null}
        onClose={handleCloseModal}
        title={selectedModel?.model_name ?? ""}
        description="Details synced from MLflow for this model version."
        cancelButtonText="Close"
      >
        {selectedModel && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: "16px",
            }}
          >
            <Box>
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                Basic information
              </Typography>
              <Box sx={detailListSx}>
                <Typography variant="body2">
                  <strong>Version:</strong> {selectedModel.version}
                </Typography>
                <Typography variant="body2">
                  <strong>Status:</strong> {selectedModel.status || selectedModel.lifecycle_stage}
                </Typography>
                <Typography variant="body2">
                  <strong>Run ID:</strong> {selectedModel.run_id}
                </Typography>
                <Typography variant="body2">
                  <strong>Created:</strong> {formatDate(new Date(selectedModel.creation_timestamp))}
                </Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                Description
              </Typography>
              <Typography variant="body2">
                {selectedModel.description || "No description available"}
              </Typography>
            </Box>
            <Box sx={{ gridColumn: "1 / -1" }}>
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                Tags
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                {Object.entries(selectedModel.tags || {}).map(([key, value]) => (
                  <Chip
                    key={key}
                    label={`${key}: ${value}`}
                    size="small"
                    sx={{
                      backgroundColor: palette.accent.indigo.bg,
                      color: palette.text.primary,
                      borderRadius: radiusPx.sm,
                    }}
                  />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                Metrics
              </Typography>
              <Box sx={detailListSx}>
                {Object.entries(selectedModel.metrics || {}).map(([key, value]) => (
                  <Typography variant="body2" key={key}>
                    <strong>{key}:</strong> {typeof value === "number" ? value.toFixed(4) : value}
                  </Typography>
                ))}
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                Parameters
              </Typography>
              <Box sx={detailListSx}>
                {Object.entries(selectedModel.parameters || {}).map(([key, value]) => (
                  <Typography variant="body2" key={key}>
                    <strong>{key}:</strong> {String(value)}
                  </Typography>
                ))}
              </Box>
            </Box>
            <Box sx={{ gridColumn: "1 / -1" }}>
              <Typography variant="subtitle2" sx={sectionTitleSx}>
                Experiment information
              </Typography>
              <Box sx={detailListSx}>
                <Typography variant="body2">
                  <strong>Experiment ID:</strong> {selectedModel.experiment_id}
                </Typography>
                <Typography variant="body2">
                  <strong>Experiment name:</strong> {selectedModel.experiment_name}
                </Typography>
                <Typography variant="body2">
                  <strong>Artifact location:</strong> {selectedModel.artifact_location}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </StandardModal>
    </Box>
  );
}
