import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasChunkError: boolean;
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    error.message?.includes("Failed to fetch dynamically imported module") ||
    error.message?.includes("Loading chunk") ||
    error.message?.includes("Importing a module script failed")
  );
}

/**
 * Top-level error boundary that catches chunk load failures caused by stale
 * deployments and prompts the user to reload. Placed around <Routes> in App
 * so that any lazy-loaded page that fails to load is caught here rather than
 * crashing the entire application.
 */
class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasChunkError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> | null {
    if (isChunkLoadError(error)) {
      return { hasChunkError: true };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (!isChunkLoadError(error)) {
      // Re-throw non-chunk errors so an outer boundary can handle them
      throw error;
    }
    console.warn(
      "ChunkErrorBoundary: a lazy-loaded module failed to load. " +
        "This usually means a new version has been deployed.",
      error,
      info
    );
  }

  render() {
    if (this.state.hasChunkError) {
      return (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            p: 4,
          }}
        >
          <Stack alignItems="center" spacing={2} sx={{ maxWidth: 420, textAlign: "center" }}>
            <AlertCircle size={48} color="#1976d2" />
            <Typography variant="h6" fontWeight={600}>
              A new version is available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The application has been updated since you last loaded the page.
              Please reload to get the latest version.
            </Typography>
            <Button
              variant="contained"
              startIcon={<RefreshCw size={16} />}
              onClick={() => window.location.reload()}
            >
              Reload now
            </Button>
          </Stack>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;
