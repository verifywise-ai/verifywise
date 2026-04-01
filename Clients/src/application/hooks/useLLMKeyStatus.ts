import { useState, useEffect } from "react";
import {
  getLLMKeyStatus,
  LLMKeyStatus,
} from "../repository/llmKeys.repository";

export function useLLMKeyStatus() {
  const [data, setData] = useState<LLMKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        const status = await getLLMKeyStatus();
        if (!cancelled) {
          setData(status);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to fetch LLM key status");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
