import { useEffect, useState } from "react";
import { GetSsoFeatureEnabled } from "../repository/ssoConfig.repository";

export function useSsoFeatureEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    GetSsoFeatureEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
