import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Typography, Button, Card, CardContent } from "@mui/material";
import { AlertCircle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console for development
    console.error("Dashboard Error Boundary caught an error:", error, errorInfo);

    // In production, send to error tracking service (Sentry, etc.)
    if (process.env.NODE_ENV === "production") {
      // TODO: Send to error tracking service
      // errorTrackingService.captureException(error, { extra: errorInfo });
    }

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error fallback UI
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "400px",
            p: 4,
          }}
        >
          <Card
            sx={{
              maxWidth: 500,
              width: "100%",
              textAlign: "center",
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ color: "error.main", display: "inline-flex", mb: 2 }}>
                <AlertCircle size={64} />
              </Box>

              <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 500 }}>
                Dashboard Error
              </Typography>

              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Something went wrong while loading the dashboard. This could be due to a temporary
                issue with one of the widgets.
              </Typography>

              <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
                <Button
                  variant="contained"
                  startIcon={<RotateCcw size={20} />}
                  onClick={this.handleReset}
                >
                  Try Again
                </Button>

                <Button variant="outlined" onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </Box>

              {/* Show error details in development */}
              {process.env.NODE_ENV === "development" && this.state.error && (
                <Box
                  sx={{
                    mt: 3,
                    p: 2,
                    backgroundColor: "grey.100",
                    borderRadius: 1,
                    textAlign: "left",
                    fontSize: "0.875rem",
                    fontFamily: "monospace",
                    overflow: "auto",
                    maxHeight: 200,
                  }}
                >
                  <Typography variant="subtitle2" gutterBottom>
                    Error Details (Development Only):
                  </Typography>
                  <Typography variant="body2" component="pre">
                    {this.state.error.toString()}
                  </Typography>
                  {this.state.errorInfo && (
                    <Typography variant="body2" component="pre" sx={{ mt: 1 }}>
                      {this.state.errorInfo.componentStack}
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default DashboardErrorBoundary;
