// Shared error-alert helper for the Regulations Tracker pages.
//
// Mirrors the useTrustIndexAlert pattern from the AI Trust Index module.
//
// Usage:
//   const { showError, AlertSlot } = useTrackerAlert();
//   trackCountry.mutate(slug, { onError: () => showError("Couldn't track this country.") });
//   ...
//   return (<>{AlertSlot}<YourPage/></>);
import { useCallback, useEffect, useState } from "react";
import { Box } from "@mui/material";
import Alert from "../../components/Alert";
import { alertState } from "../../../domain/types/alert.types";

export function useTrackerAlert() {
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

  const showSuccess = useCallback((body: string, title = "Done") => {
    setAlert({ variant: "success", title, body });
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

  return { showError, showSuccess, AlertSlot };
}
