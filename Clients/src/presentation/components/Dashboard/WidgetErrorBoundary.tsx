import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Card, CardContent, Typography, Button } from "@mui/material";
import { AlertCircle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  widgetId: string;
  widgetTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class WidgetErrorBoundary extends Component<Props, State> {
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
    // Log the error for debugging
    console.error(`Widget ${this.props.widgetId} crashed:`, error, errorInfo);

    // In production, send to error tracking service
    if (process.env.NODE_ENV === "production") {
      // TODO: Send to error tracking service
      // errorTrackingService.captureException(error, {
      //   extra: { widgetId: this.props.widgetId, ...errorInfo }
      // });
    }

    this.setState({
      error,
      errorInfo,
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      const widgetTitle = this.props.widgetTitle || "Widget";

      return (
        <Card
          sx={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 120,
          }}
        >
          <CardContent sx={{ textAlign: "center", p: 3 }}>
            <Box sx={{ color: "error.main", display: "inline-flex", mb: 2 }}>
              <AlertCircle size={48} />
            </Box>

            <Typography
              variant="h6"
              component="h3"
              gutterBottom
              sx={{ fontWeight: 500, fontSize: "1rem" }}
            >
              {widgetTitle} Error
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: "0.875rem" }}>
              This widget failed to load properly.
            </Typography>

            <Button
              variant="contained"
              size="small"
              startIcon={<RotateCcw size={16} />}
              onClick={this.handleRetry}
              sx={{ fontSize: "0.75rem" }}
            >
              Retry
            </Button>

            {/* Show error details in development */}
            {process.env.NODE_ENV === "development" && this.state.error && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  backgroundColor: "grey.100",
                  borderRadius: 1,
                  textAlign: "left",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  overflow: "auto",
                  maxHeight: 100,
                  border: "1px solid",
                  borderColor: "grey.300",
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                  Development Error Details:
                </Typography>
                <Typography
                  variant="caption"
                  component="pre"
                  sx={{ fontSize: "0.7rem", lineHeight: 1.2 }}
                >
                  {this.state.error.toString()}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default WidgetErrorBoundary;
