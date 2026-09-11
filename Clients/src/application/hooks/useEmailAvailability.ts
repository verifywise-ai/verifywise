import { useEffect, useRef, useState } from "react";
import { isValidEmail } from "../validations/emailAddress.rule";
import { checkEmailExists } from "../repository/superAdmin.repository";

export type EmailAvailabilityStatus =
  | "idle" // empty
  | "invalid" // malformed
  | "checking"
  | "available"
  | "taken"
  | "error"; // network / server

interface State {
  status: EmailAvailabilityStatus;
}

const DEBOUNCE_MS = 400;

/**
 * Debounced check against /super-admin/users/exists. Guards against out-of-order
 * responses via a token so stale results can't overwrite the latest status.
 */
export function useEmailAvailability(email: string): State {
  const [status, setStatus] = useState<EmailAvailabilityStatus>("idle");
  const tokenRef = useRef(0);

  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus("idle");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setStatus("invalid");
      return;
    }

    const myToken = ++tokenRef.current;
    setStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await checkEmailExists(trimmed);
        if (myToken !== tokenRef.current) return;
        const exists = Boolean((res.data as any)?.data?.exists);
        setStatus(exists ? "taken" : "available");
      } catch {
        if (myToken !== tokenRef.current) return;
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [email]);

  return { status };
}
