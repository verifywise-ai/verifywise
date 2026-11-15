import { Navigate, useParams } from "react-router";
import { Box, CircularProgress, useTheme } from "@mui/material";
import { useExtensions } from "../../../../application/contexts/Extensions.context";
import ModelLifecycleDetail from "../../Extensions/model-lifecycle/ModelLifecycleDetail";

/**
 * /model-inventory/models/:id. Shows the model's lifecycle when the Model
 * Lifecycle extension is on. When it is off, or the extensions list could not
 * be loaded, a saved or shared link lands on the model in the inventory
 * instead of a blank page. Until the list has loaded, a spinner: redirecting
 * then would bounce every visitor before the answer is known.
 */
function ModelLifecycleDetailPage() {
  const theme = useTheme();
  const { id } = useParams<{ id: string }>();
  const { isEnabled, loaded, error } = useExtensions();
  const modelId = id && /^\d+$/.test(id) ? Number(id) : null;

  if (!modelId) return <Navigate replace to="/model-inventory" />;

  if (!loaded) {
    return (
      <Box display="flex" justifyContent="center" py="48px">
        <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
      </Box>
    );
  }

  if (error || !isEnabled("model-lifecycle")) {
    return <Navigate replace to={`/model-inventory?modelId=${modelId}`} />;
  }

  return <ModelLifecycleDetail modelId={modelId} />;
}

export default ModelLifecycleDetailPage;
