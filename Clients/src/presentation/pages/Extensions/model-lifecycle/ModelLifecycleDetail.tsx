/**
 * ModelLifecycleDetail - Full page detail view for model lifecycle
 *
 * Injected into the model detail page slot.
 * Shows model header and lifecycle phases.
 */

import { useState, useEffect } from "react";
import { Stack, Box, Typography, CircularProgress, useTheme } from "@mui/material";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import ModelLifecycleTab from "./ModelLifecycleTab";
import { apiServices } from "../../../../infrastructure/api/networkServices";

interface ModelData {
  id: number;
  model?: string;
  provider?: string;
  provider_model?: string;
  version?: string;
  status?: string;
}

interface ModelLifecycleDetailProps {
  modelId: number;
}

export default function ModelLifecycleDetail({ modelId }: ModelLifecycleDetailProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [model, setModel] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!modelId) return;

    const fetchModel = async () => {
      setLoading(true);
      try {
        const response = await apiServices.get(`/modelInventory/${modelId}`);
        const payload = (response.data as any)?.data ?? response.data;
        setModel(payload as ModelData);
      } catch (error) {
        console.error("Failed to fetch model:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchModel();
  }, [modelId]);

  if (loading) {
    return (
      <Stack
        sx={{
          alignItems: "center",
          justifyContent: "center",
          py: "64px",
        }}
      >
        <CircularProgress />
      </Stack>
    );
  }

  if (!model) {
    return (
      <Stack
        sx={{
          alignItems: "center",
          justifyContent: "center",
          py: "64px",
        }}
      >
        <Typography>Model not found</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0} sx={{ gap: "16px", maxWidth: "1400px", width: "100%" }}>
      {/* Header card */}
      <Box
        sx={{
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: "4px",
          p: "20px",
          backgroundColor: theme.palette.background.paper,
        }}
      >
        <Stack sx={{ gap: "16px" }}>
          <Box
            component="button"
            onClick={() => navigate("/model-inventory")}
            sx={{
              "display": "flex",
              "alignItems": "center",
              "gap": "8px",
              "background": "none",
              "border": "none",
              "cursor": "pointer",
              "padding": 0,
              "color": theme.palette.text.secondary,
              "fontSize": "14px",
              "&:hover": {
                color: theme.palette.text.primary,
              },
            }}
          >
            <ArrowLeft size={16} />
            Back to Model Inventory
          </Box>

          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <Stack sx={{ gap: "6px" }}>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: "16px",
                  color: theme.palette.text.primary,
                }}
              >
                {model.model || model.provider_model}
              </Typography>
              <Stack direction="row" sx={{ gap: "16px" }}>
                {model.provider && (
                  <Typography
                    sx={{
                      fontSize: "13px",
                      color: theme.palette.text.secondary,
                    }}
                  >
                    Provider: <strong>{model.provider}</strong>
                  </Typography>
                )}
                {model.version && (
                  <Typography
                    sx={{
                      fontSize: "13px",
                      color: theme.palette.text.secondary,
                    }}
                  >
                    Version: <strong>{model.version}</strong>
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </Box>

      {/* Lifecycle content */}
      <ModelLifecycleTab modelId={modelId} />
    </Stack>
  );
}
