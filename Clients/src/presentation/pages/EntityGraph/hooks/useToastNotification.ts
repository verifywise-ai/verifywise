import { useState, useCallback } from "react";
import { TIMING } from "../constants";

interface ToastMessage {
  title: string;
  body: string;
}

/**
 * Hook to manage toast notification state and display.
 */
export function useToastNotification() {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<ToastMessage>({ title: "", body: "" });

  const showToastWithMessage = useCallback((message: ToastMessage) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), TIMING.TOAST_DURATION);
  }, []);

  const hideToast = useCallback(() => {
    setShowToast(false);
  }, []);

  return {
    showToast,
    toastMessage,
    showToastWithMessage,
    hideToast,
  };
}
