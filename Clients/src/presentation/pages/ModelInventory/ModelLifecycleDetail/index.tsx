import { Navigate, useParams } from "react-router";
import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import { useExtensions } from "../../../../application/contexts/Extensions.context";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { status } from "../../../themes/palette";
import ModelLifecycleDetail from "../../Extensions/model-lifecycle/ModelLifecycleDetail";

/**
 * /model-inventory/models/:id. Shows the model's lifecycle when the Model
 * Lifecycle extension is on. When the list says it is off, a saved or shared
 * link lands on the model in the inventory instead of a blank page. Until the
 * list has loaded, a spinner: redirecting then would bounce every visitor
 * before the answer is known. A failed load with no list to go on shows an
 * error with Try again rather than a redirect, so a passing network error
 * does not throw the user out; once a list is held, a later failed refetch is
 * ignored.
 */
function ModelLifecycleDetailPage() {
  const theme = useTheme();
  const { id } = useParams<{ id: string }>();
  const { extensions, isEnabled, loaded, error, refetch } = useExtensions();
  const modelId = id && /^\d+$/.test(id) ? Number(id) : null;

  if (!modelId) return <Navigate replace to="/model-inventory" />;

  if (!loaded) {
    return (
      <Box display="flex" justifyContent="center" py="48px">
        <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
      </Box>
    );
  }

  if (error && extensions.length === 0) {
    return (
      <Stack spacing="12px" alignItems="flex-start" sx={{ py: "24px" }}>
        <Typography
          role="alert"
          sx={{ fontSize: 13, color: theme.palette.status.error?.text ?? status.error.text }}
        >
          Could not load the model lifecycle.
        </Typography>
        <CustomizableButton variant="outlined" onClick={() => void refetch()}>
          Try again
        </CustomizableButton>
      </Stack>
    );
  }

  if (!isEnabled("model-lifecycle")) {
    return <Navigate replace to={`/model-inventory?modelId=${modelId}`} />;
  }

  return <ModelLifecycleDetail modelId={modelId} />;
}

export default ModelLifecycleDetailPage;
