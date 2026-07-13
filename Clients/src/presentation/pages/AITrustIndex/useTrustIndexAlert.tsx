// Shared error-alert helper for the AI Trust Index pages.
//
// The track/untrack/bulk/settings mutations previously failed silently — a
// failed request left the button unchanged with no feedback. This hook gives
// every page a one-line way to surface a mutation error using the app-standard
// Alert toast, without each page re-implementing the alert state + auto-dismiss.
//
// Usage:
//   const { showError, AlertSlot } = useTrustIndexAlert();
//   trackApp.mutate(slug, { onError: () => showError("Couldn't track this app.") });
//   ...
//   return (<>{AlertSlot}<YourPage/></>);
import { useCallback, useEffect, useState } from "react";
import { Box } from "@mui/material";
import Alert from "../../components/Alert";
import { alertState } from "../../../domain/types/alert.types";

export function useTrustIndexAlert() {
  const [alert, setAlert] = useState<alertState | null>(null);

  // Auto-dismiss after 4s so a transient error toast does not linger.
  useEffect(() => {
    if (!alert) return undefined;
    const timer = setTimeout(() => setAlert(null), 4000);
    return () => clearTimeout(timer);
  }, [alert]);

  const showError = useCallback((body: string, title = "Something went wrong") => {
    setAlert({ variant: "error", title, body });
  }, []);

  const AlertSlot = alert ? (
    <Box sx={{ position: "fixed", top: "16px", right: "16px", zIndex: 9999 }}>
      <Alert
        variant={alert.variant}
        title={alert.title}
        body={alert.body}
        isToast
        onClick={() => setAlert(null)}
      />
    </Box>
  ) : null;

  return { showError, AlertSlot };
}
