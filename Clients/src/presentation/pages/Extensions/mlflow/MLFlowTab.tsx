/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Button,
  Grid,
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
  Popover,
  Stack,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
} from "@mui/material";
import type { GridProps } from "@mui/material";
import { RefreshCw, XCircle, Eye, ChevronsUpDown, X, Layers } from "lucide-react";
import {
  colors,
  typography,
  borderRadius,
  cardStyles,
  tableStyles,
  chipStyles,
  buttonStyles,
  modalStyles,
} from "../theme";
import { apiServices } from "../../../../infrastructure/api/networkServices";

const SelectorVertical = (props: any) => <ChevronsUpDown size={16} {...props} />;

interface GroupByOption {
  id: string;
  label: string;
}

interface GroupedData<T> {
  group: string;
  items: T[];
}

function useTableGrouping<T>({
  data,
  groupByField,
  sortOrder,
  getGroupKey,
}: {
  data: T[];
  groupByField: string | null;
  sortOrder: "asc" | "desc";
  getGroupKey: (item: T, field: string) => string | string[];
}): GroupedData<T>[] | null {
  return useMemo(() => {
    if (!groupByField) return null;

    const groups: Record<string, T[]> = {};

    data.forEach((item) => {
      const keys = getGroupKey(item, groupByField);
      const groupKeys = Array.isArray(keys) ? keys : [keys];

      groupKeys.forEach((groupKey) => {
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(item);
      });
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) =>
      sortOrder === "asc" ? a.localeCompare(b) : b.localeCompare(a),
    );

    return sortedGroupKeys.map((key) => ({ group: key, items: groups[key] }));
  }, [data, groupByField, sortOrder, getGroupKey]);
}

function useGroupByState(defaultGroupBy?: string, defaultSortOrder: "asc" | "desc" = "asc") {
  const [groupBy, setGroupBy] = useState<string | null>(defaultGroupBy || null);
  const [groupSortOrder, setGroupSortOrder] = useState<"asc" | "desc">(defaultSortOrder);

  const handleGroupChange = (field: string | null, sortOrder: "asc" | "desc") => {
    setGroupBy(field);
    setGroupSortOrder(sortOrder);
  };

  return { groupBy, groupSortOrder, handleGroupChange };
}

const GroupBadge: React.FC<{ count: number }> = ({ count }) => (
  <Box
    sx={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      backgroundColor: "#dcfce7",
      color: "#166534",
      fontSize: "11px",
      fontWeight: 600,
      marginLeft: "6px",
    }}
  >
    {count}
  </Box>
);

interface GroupByProps {
  options: GroupByOption[];
  onGroupChange: (groupBy: string | null, sortOrder: "asc" | "desc") => void;
}

const GroupBy: React.FC<GroupByProps> = ({ options, onGroupChange }) => {
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    let parent = event.currentTarget.parentElement;
    while (parent) {
      const overflow = window.getComputedStyle(parent).overflow;
      if (overflow === "auto" || overflow === "scroll" || parent === document.body) {
        scrollParentRef.current = parent;
        break;
      }
      parent = parent.parentElement;
    }
  };

  const handleClose = () => setAnchorEl(null);

  useEffect(() => {
    const handleScroll = () => {
      if (anchorEl) handleClose();
    };
    if (anchorEl && scrollParentRef.current) {
      scrollParentRef.current.addEventListener("scroll", handleScroll);
      window.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      if (scrollParentRef.current) {
        scrollParentRef.current.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [anchorEl]);

  const handleGroupFieldChange = (event: any) => {
    const value = event.target.value;
    setSelectedGroup(value);
    if (value === "") {
      onGroupChange(null, "asc");
      setSortOrder("asc");
    } else {
      onGroupChange(value, sortOrder);
    }
  };

  const handleSortChange = (_: any, value: string | null) => {
    if (value) {
      const order = value as "asc" | "desc";
      setSortOrder(order);
      if (selectedGroup) onGroupChange(selectedGroup, order);
    }
  };

  const handleClear = () => {
    setSelectedGroup("");
    setSortOrder("asc");
    onGroupChange(null, "asc");
    handleClose();
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Button
        onClick={handleClick}
        variant="outlined"
        sx={{
          "fontSize": "13px",
          "fontWeight": 500,
          "padding": "6px 12px",
          "textTransform": "none",
          "color": "#374151",
          "borderColor": "#d0d5dd",
          "height": "34px",
          "minWidth": selectedGroup ? "110px" : "80px",
          "backgroundColor": open ? "#f0fdf4" : "transparent",
          "&:hover": { borderColor: "#98a2b3", backgroundColor: "#f0fdf4" },
        }}
      >
        <Layers size={16} color="#13715B" style={{ marginRight: "6px" }} />
        Group
        {selectedGroup && <GroupBadge count={1} />}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              marginTop: "8px",
              padding: "16px",
              minWidth: "400px",
              boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.1)",
              borderRadius: "8px",
            },
          },
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography
              sx={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#667085",
              }}
            >
              Group by
            </Typography>
            <Box
              onClick={selectedGroup ? handleClear : handleClose}
              sx={{
                "cursor": "pointer",
                "display": "flex",
                "alignItems": "center",
                "&:hover": { opacity: 0.7 },
              }}
            >
              <X size={16} color="#6b7280" />
            </Box>
          </Stack>

          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: "center",
            }}
          >
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={selectedGroup}
                onChange={handleGroupFieldChange}
                displayEmpty
                sx={{ fontSize: "13px" }}
              >
                <MenuItem value="">Select field</MenuItem>
                {options.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <ToggleButtonGroup value={sortOrder} exclusive onChange={handleSortChange} size="small">
              <ToggleButton value="asc" sx={{ fontSize: "12px", textTransform: "none", px: 2 }}>
                A → Z
              </ToggleButton>
              <ToggleButton value="desc" sx={{ fontSize: "12px", textTransform: "none", px: 2 }}>
                Z → A
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
};

interface GroupedTableViewProps<T> {
  groupedData: GroupedData<T>[] | null;
  ungroupedData: T[];
  renderTable: (data: T[], options?: { hidePagination?: boolean }) => React.ReactNode;
}

function GroupedTableView<T>({
  groupedData,
  ungroupedData,
  renderTable,
}: GroupedTableViewProps<T>): React.ReactElement {
  if (groupedData) {
    if (groupedData.length === 0) return <>{renderTable([])}</>;
    return (
      <Stack spacing={0}>
        {groupedData.map(({ group, items }, index) => (
          <Box key={group} sx={{ marginTop: index === 0 ? 0 : "24px" }}>
            <Typography
              component="div"
              sx={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "4px",
                paddingLeft: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {group}
              <GroupBadge count={items.length} />
            </Typography>
            {renderTable(items, { hidePagination: true })}
          </Box>
        ))}
      </Stack>
    );
  }
  return <>{renderTable(ungroupedData)}</>;
}

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
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<MLFlowModel | null>(null);
  const [mlflowData, setMlflowData] = useState<MLFlowModel[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

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

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

  const fetchMLFlowData = async () => {
    setLoading(true);
    setWarning(null);
    try {
      const response = await apiServices.get("/extensions/mlflow/models");
      const payload = (response.data as any)?.data;
      if (payload && "models" in payload && Array.isArray(payload.models)) {
        if (!payload.configured) {
          setWarning("Configure the MLFlow extension to start syncing live data.");
        } else if (payload.connected === false) {
          setWarning(payload.message || "MLFlow server is not reachable.");
        } else if (payload.error) {
          setWarning(payload.error);
        }
        setMlflowData(payload.models);
      } else {
        setMlflowData([]);
      }
    } catch {
      setWarning("Unable to reach the MLFlow backend.");
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
      if (error?.response?.data?.message) {
        setWarning(`Sync failed: ${error.response.data.message}`);
      } else {
        setWarning("Failed to sync with MLflow server. Showing cached data.");
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

  const getMLFlowGroupKey = useCallback((model: MLFlowModel, field: string): string | string[] => {
    switch (field) {
      case "lifecycle_stage":
        return model.lifecycle_stage || "Unknown";
      case "experiment":
        return model.experiment_name || model.experiment_id || "Unknown Experiment";
      case "model_name":
        return model.model_name || "Unknown Model";
      default:
        return "Other";
    }
  }, []);

  const groupedMLFlowData = useTableGrouping({
    data: mlflowData,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getMLFlowGroupKey,
  });

  if (loading && mlflowData.length === 0) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "400px" }}
      >
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>
          Loading MLFlow data...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: "100%", overflowX: "hidden" }}>
      {warning && (
        <Alert severity="warning" sx={{ mb: 8 }}>
          {warning}
        </Alert>
      )}

      <Box
        sx={{
          mb: 2,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 2,
          width: "100%",
        }}
      >
        <GroupBy
          options={[
            { id: "lifecycle_stage", label: "Lifecycle stage" },
            { id: "experiment", label: "Experiment" },
            { id: "model_name", label: "Model name" },
          ]}
          onGroupChange={handleGroupChange}
        />
        <Button
          variant="outlined"
          startIcon={<RefreshCw size={16} />}
          onClick={handleRefresh}
          disabled={loading}
          sx={{
            ...buttonStyles.base,
            ...buttonStyles.sizes.medium,
            ...buttonStyles.primary.outlined,
            textTransform: "none",
          }}
        >
          Sync
        </Button>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 4, flexWrap: "wrap" }}>
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

      <Box sx={{ mt: 8, mb: 2 }}>
        {mlflowData.length === 0 && !loading ? (
          <Box sx={{ textAlign: "center", py: 4, color: colors.textTertiary }}>
            <Typography sx={{ fontSize: typography.sizes.md }}>
              No MLFlow runs have been synced yet. Configure the integration and click Sync to pull
              the latest models.
            </Typography>
          </Box>
        ) : (
          <GroupedTableView
            groupedData={groupedMLFlowData}
            ungroupedData={mlflowData}
            renderTable={(data, options) => {
              const hidePagination = options?.hidePagination || false;
              const displayData = hidePagination
                ? data
                : data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

              return (
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
                          "Model Name",
                          "Version",
                          "Status",
                          "Created",
                          "Last Updated",
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
                            {formatDate(model.creation_timestamp)}
                          </TableCell>
                          <TableCell sx={tableStyles.cell}>
                            {formatDate(model.last_updated_timestamp)}
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
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Tooltip title="View details">
                                <IconButton size="small" sx={{ mr: 1 }}>
                                  <Eye size={16} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    {data.length > 0 && !hidePagination && (
                      <TableFooter>
                        <TableRow>
                          <TableCell
                            sx={{
                              fontSize: typography.sizes.md,
                              color: colors.textTertiary,
                            }}
                          >
                            Showing {getRange} of {data.length} model(s)
                          </TableCell>
                          <TablePagination
                            count={data.length}
                            page={page}
                            onPageChange={handleChangePage}
                            rowsPerPage={rowsPerPage}
                            rowsPerPageOptions={[5, 10, 15, 25]}
                            onRowsPerPageChange={handleRowsPerPageChange}
                            labelRowsPerPage="Rows per page"
                            labelDisplayedRows={({ page, count }) =>
                              `Page ${page + 1} of ${Math.max(1, Math.ceil(count / rowsPerPage))}`
                            }
                            slotProps={{ select: { IconComponent: SelectorVertical } }}
                            sx={{ fontSize: typography.sizes.md }}
                          />
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </TableContainer>
              );
            }}
          />
        )}
      </Box>

      {selectedModel && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            ...modalStyles.overlay,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Card sx={{ ...modalStyles.content }}>
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
                <Typography
                  variant="h6"
                  sx={{ ...modalStyles.title, fontSize: typography.sizes.xl }}
                >
                  {selectedModel.model_name}
                </Typography>
                <IconButton onClick={handleCloseModal} sx={{ color: colors.textTertiary }}>
                  <XCircle size={20} />
                </IconButton>
              </Box>

              <Grid container spacing={2}>
                <Grid
                  {...({ item: true, xs: 12, sm: 6 } as GridProps & {
                    item: boolean;
                    xs: number;
                    sm: number;
                  })}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Basic Information
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Typography variant="body2">
                      <strong>Version:</strong> {selectedModel.version}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Status:</strong>{" "}
                      {selectedModel.status || selectedModel.lifecycle_stage}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Run ID:</strong> {selectedModel.run_id}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Created:</strong> {formatDate(selectedModel.creation_timestamp)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid
                  {...({ item: true, xs: 12, sm: 6 } as GridProps & {
                    item: boolean;
                    xs: number;
                    sm: number;
                  })}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {selectedModel.description || "No description available"}
                  </Typography>
                </Grid>
                <Grid {...({ item: true, xs: 12 } as GridProps & { item: boolean; xs: number })}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Tags
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {Object.entries(selectedModel.tags || {}).map(([key, value]) => (
                      <Chip
                        key={key}
                        label={`${key}: ${value}`}
                        size="small"
                        sx={{
                          backgroundColor: "#E0EAFF",
                          color: "#0F172A",
                          borderRadius: "4px",
                        }}
                      />
                    ))}
                  </Box>
                </Grid>
                <Grid
                  {...({ item: true, xs: 12, sm: 6 } as GridProps & {
                    item: boolean;
                    xs: number;
                    sm: number;
                  })}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Metrics
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {Object.entries(selectedModel.metrics || {}).map(([key, value]) => (
                      <Typography variant="body2" key={key}>
                        <strong>{key}:</strong>{" "}
                        {typeof value === "number" ? value.toFixed(4) : value}
                      </Typography>
                    ))}
                  </Box>
                </Grid>
                <Grid
                  {...({ item: true, xs: 12, sm: 6 } as GridProps & {
                    item: boolean;
                    xs: number;
                    sm: number;
                  })}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Parameters
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {Object.entries(selectedModel.parameters || {}).map(([key, value]) => (
                      <Typography variant="body2" key={key}>
                        <strong>{key}:</strong> {String(value)}
                      </Typography>
                    ))}
                  </Box>
                </Grid>
                <Grid {...({ item: true, xs: 12 } as GridProps & { item: boolean; xs: number })}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Experiment Information
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Typography variant="body2">
                      <strong>Experiment ID:</strong> {selectedModel.experiment_id}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Experiment Name:</strong> {selectedModel.experiment_name}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Artifact Location:</strong> {selectedModel.artifact_location}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}
