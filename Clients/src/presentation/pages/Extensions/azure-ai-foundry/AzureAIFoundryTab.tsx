/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  TablePagination,
  Chip,
  Drawer,
  Stack,
  Divider,
} from "@mui/material";
import { RefreshCw, X, ChevronsUpDown } from "lucide-react";
import { colors, borderRadius, chipStyles, buttonStyles, tableStyles } from "../theme";
import { apiServices } from "../../../../infrastructure/api/networkServices";

const SelectorVertical = (props: any) => <ChevronsUpDown size={16} {...props} />;

interface AzureModel {
  id: number;
  deployment_name: string;
  model_name: string;
  model_format: string | null;
  model_version: string | null;
  provisioning_state: string | null;
  sku_name: string | null;
  sku_capacity: number | null;
  capabilities: Record<string, string>;
  rate_limits: Array<{ key: string; count: number; renewalPeriod: number }>;
  rai_policy_name: string | null;
  created_by: string | null;
  azure_created_at: string | null;
  azure_modified_at: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Typography sx={{ fontSize: 12, fontWeight: 600, color: colors.textTertiary, mb: "4px" }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: 13, color: colors.textPrimary }}>{value}</Typography>
  </Box>
);

const StatCard = ({ label, value, color }: { label: string; value: number; color?: string }) => (
  <Box
    sx={{
      flex: "1 1 0",
      minWidth: 100,
      border: `1px solid ${colors.border}`,
      borderRadius: borderRadius.sm,
      p: "12px 16px",
      backgroundColor: colors.background,
    }}
  >
    <Typography sx={{ fontSize: 12, color: colors.textTertiary, mb: "4px" }}>{label}</Typography>
    <Typography sx={{ fontSize: 20, fontWeight: 600, color: color || colors.textPrimary }}>
      {value}
    </Typography>
  </Box>
);

export default function AzureAIFoundryTab() {
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<AzureModel | null>(null);
  const [models, setModels] = useState<AzureModel[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const stats = useMemo(() => {
    const succeeded = models.filter(
      (m) => (m.provisioning_state || "").toLowerCase() === "succeeded",
    ).length;
    const gpt = models.filter((m) => m.model_name?.toLowerCase().includes("gpt")).length;
    const embeddings = models.filter(
      (m) =>
        m.model_name?.toLowerCase().includes("embedding") ||
        m.model_name?.toLowerCase().includes("ada"),
    ).length;
    return { total: models.length, succeeded, gpt, embeddings };
  }, [models]);

  const fetchModels = async () => {
    setLoading(true);
    setWarning(null);
    try {
      const response = await apiServices.get("/extensions/azure-ai-foundry/models");
      const payload = (response.data as any)?.data as
        { configured?: boolean; models?: AzureModel[]; message?: string } | undefined;
      if (payload?.models) {
        setModels(payload.models);
        if (!payload.configured) {
          setWarning(
            "Configure the Azure AI Foundry extension to start syncing model deployments.",
          );
        }
      } else {
        setModels([]);
      }
    } catch {
      setWarning("Unable to reach the Azure AI Foundry backend.");
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    setWarning(null);
    try {
      await apiServices.post("/extensions/azure-ai-foundry/sync", {});
    } catch (error: any) {
      setWarning(error?.response?.data?.message || "Sync failed. Showing cached data.");
    }
    await fetchModels();
  };

  const handleChangePage = useCallback((_: unknown, newPage: number) => setPage(newPage), []);
  const handleRowsPerPageChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  const displayData = models.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const getStatusChip = (state: string | null) => {
    const s = (state || "unknown").toLowerCase();
    let style = chipStyles.neutral;
    if (s === "succeeded") style = chipStyles.success;
    else if (s === "updating" || s === "creating") style = chipStyles.warning;
    else if (s === "failed" || s === "deleting") style = chipStyles.error;
    return <Chip label={state || "Unknown"} size="small" sx={{ ...chipStyles.base, ...style }} />;
  };

  if (loading && models.length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <CircularProgress size={24} />
        <Typography sx={{ ml: "8px", fontSize: 13, color: colors.textTertiary }}>
          Loading...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: "100%" }}>
      {warning && (
        <Box
          sx={{
            p: "12px 16px",
            mb: "16px",
            borderRadius: borderRadius.sm,
            backgroundColor: "#FFF7ED",
            border: "1px solid #FED7AA",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "#92400E" }}>{warning}</Typography>
        </Box>
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: "16px" }}>
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{
            ...buttonStyles.base,
            ...buttonStyles.sizes.medium,
            ...buttonStyles.primary.outlined,
            border: `1px solid ${colors.border}`,
            color: colors.textSecondary,
            backgroundColor: "transparent",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw
            size={14}
            style={loading ? { animation: "spin 1s linear infinite" } : undefined}
          />
          {loading ? "Syncing..." : "Sync"}
        </button>
      </Box>

      <Box sx={{ display: "flex", gap: "8px", mb: "16px" }}>
        <StatCard label="Total deployments" value={stats.total} />
        <StatCard label="Succeeded" value={stats.succeeded} color={colors.success} />
        <StatCard label="GPT models" value={stats.gpt} />
        <StatCard label="Embeddings" value={stats.embeddings} />
      </Box>

      {models.length === 0 && !loading ? (
        <Box sx={{ textAlign: "center", py: "48px", color: colors.textTertiary }}>
          <Typography sx={{ fontSize: 13 }}>
            No deployments synced yet. Click Sync to pull model deployments from Azure AI Foundry.
          </Typography>
        </Box>
      ) : (
        <TableContainer
          sx={{ border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: colors.backgroundSecondary }}>
                {[
                  "Deployment",
                  "Model",
                  "Publisher",
                  "Version",
                  "Status",
                  "SKU",
                  "Capacity",
                  "Last synced",
                ].map((h) => (
                  <TableCell key={h} sx={{ ...tableStyles.header, padding: "8px 16px" }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {displayData.map((model) => (
                <TableRow
                  key={model.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => setSelectedModel(model)}
                >
                  <TableCell sx={tableStyles.cell}>{model.deployment_name}</TableCell>
                  <TableCell sx={tableStyles.cell}>{model.model_name}</TableCell>
                  <TableCell sx={tableStyles.cell}>{model.model_format || "—"}</TableCell>
                  <TableCell sx={tableStyles.cell}>{model.model_version || "—"}</TableCell>
                  <TableCell sx={tableStyles.cell}>
                    {getStatusChip(model.provisioning_state)}
                  </TableCell>
                  <TableCell sx={tableStyles.cell}>{model.sku_name || "—"}</TableCell>
                  <TableCell sx={tableStyles.cell}>{model.sku_capacity ?? "—"}</TableCell>
                  <TableCell sx={tableStyles.cell}>{formatDate(model.last_synced_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {models.length > rowsPerPage && (
              <TableFooter>
                <TableRow>
                  <TablePagination
                    count={models.length}
                    page={page}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[5, 10, 25]}
                    onRowsPerPageChange={handleRowsPerPageChange}
                    slotProps={{ select: { IconComponent: SelectorVertical } }}
                    sx={{ fontSize: 13 }}
                  />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      )}

      <Drawer
        anchor="right"
        open={!!selectedModel}
        onClose={() => setSelectedModel(null)}
        PaperProps={{ sx: { width: 480, backgroundColor: "#FCFCFD" } }}
      >
        {selectedModel && (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ p: "16px 24px" }}
            >
              <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
                {selectedModel.deployment_name}
              </Typography>
              <IconButton onClick={() => setSelectedModel(null)} size="small">
                <X size={20} />
              </IconButton>
            </Stack>
            <Divider />
            <Stack sx={{ p: "24px", gap: "20px", flex: 1, overflow: "auto" }}>
              <DetailRow label="Model" value={selectedModel.model_name} />
              <DetailRow label="Publisher" value={selectedModel.model_format || "—"} />
              <DetailRow label="Version" value={selectedModel.model_version || "—"} />
              <Box>
                <Typography
                  sx={{ fontSize: 12, fontWeight: 600, color: colors.textTertiary, mb: "4px" }}
                >
                  Status
                </Typography>
                {getStatusChip(selectedModel.provisioning_state)}
              </Box>
              <DetailRow label="SKU" value={selectedModel.sku_name || "—"} />
              <DetailRow label="Capacity" value={String(selectedModel.sku_capacity ?? "—")} />
              <DetailRow label="RAI policy" value={selectedModel.rai_policy_name || "—"} />
              <DetailRow label="Created by" value={selectedModel.created_by || "—"} />

              <Box>
                <Typography
                  sx={{ fontSize: 12, fontWeight: 600, color: colors.textTertiary, mb: "4px" }}
                >
                  Capabilities
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap="4px">
                  {Object.entries(selectedModel.capabilities || {}).length > 0 ? (
                    Object.entries(selectedModel.capabilities).map(([key, value]) => (
                      <Chip
                        key={key}
                        label={`${key}: ${value}`}
                        size="small"
                        sx={{ ...chipStyles.base, ...chipStyles.info }}
                      />
                    ))
                  ) : (
                    <Typography sx={{ fontSize: 13, color: colors.textTertiary }}>None</Typography>
                  )}
                </Stack>
              </Box>

              <Box>
                <Typography
                  sx={{ fontSize: 12, fontWeight: 600, color: colors.textTertiary, mb: "4px" }}
                >
                  Rate limits
                </Typography>
                {selectedModel.rate_limits?.length > 0 ? (
                  selectedModel.rate_limits.map((limit, i) => (
                    <Typography key={i} sx={{ fontSize: 13 }}>
                      {limit.key}: {limit.count} per {limit.renewalPeriod}s
                    </Typography>
                  ))
                ) : (
                  <Typography sx={{ fontSize: 13, color: colors.textTertiary }}>None</Typography>
                )}
              </Box>

              <DetailRow label="Azure created" value={formatDate(selectedModel.azure_created_at)} />
              <DetailRow
                label="Azure modified"
                value={formatDate(selectedModel.azure_modified_at)}
              />
              <DetailRow label="Last synced" value={formatDate(selectedModel.last_synced_at)} />
            </Stack>
          </>
        )}
      </Drawer>
    </Box>
  );
}
