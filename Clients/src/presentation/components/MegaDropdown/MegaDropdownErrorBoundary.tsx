import React, { Component, ReactNode } from "react";
import { Button } from "@mui/material";
import { Plus } from "lucide-react";
import { palette, radiusPx } from "../../themes/palette";

interface MegaDropdownErrorBoundaryProps {
  children: ReactNode;
}

interface MegaDropdownErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary specifically for the MegaDropdown component
 * Provides a fallback UI if the dropdown crashes
 */
class MegaDropdownErrorBoundary extends Component<
  MegaDropdownErrorBoundaryProps,
  MegaDropdownErrorBoundaryState
> {
  constructor(props: MegaDropdownErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MegaDropdownErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to error reporting service in production
    if (process.env.NODE_ENV === "production") {
      // TODO: Send to error tracking service (e.g., Sentry)
      console.error("MegaDropdown Error:", error, errorInfo);
    } else {
      console.error("MegaDropdown crashed:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Fallback: Simple "Add new" button that's always functional
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<Plus size={14} />}
          disabled
          sx={{
            background: `linear-gradient(135deg, ${palette.status.success.strong} 0%, #059669 100%)`,
            color: "white",
            fontWeight: 500,
            fontSize: "13px",
            height: "32px",
            minHeight: "32px",
            padding: "8px 16px",
            borderRadius: radiusPx.sm,
            textTransform: "none",
            opacity: 0.6,
            cursor: "not-allowed",
          }}
          title="Add new menu temporarily unavailable"
        >
          Add new
        </Button>
      );
    }

    return this.props.children;
  }
}

export default MegaDropdownErrorBoundary;
