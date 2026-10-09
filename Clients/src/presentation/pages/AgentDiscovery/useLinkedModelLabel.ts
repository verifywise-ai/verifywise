import { useEffect, useState } from "react";
import { getEntityById } from "../../../application/repository/entity.repository";
import { formatModelLabel } from "./agentLabels";

/**
 * Label of the model an agent is linked to, fetched on its own (not the whole
 * inventory). Null while loading, when there is no id, or when the fetch fails,
 * so callers show their "Model #id" fallback. A response for an id that has
 * since changed is ignored.
 */
export function useLinkedModelLabel(modelId: number | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(null);
    if (!modelId) return;
    let cancelled = false;
    getEntityById({ routeUrl: `/modelInventory/${modelId}` })
      .then((response) => {
        if (!cancelled && response?.data) setLabel(formatModelLabel(response.data));
      })
      .catch(() => {
        // Keep the "Model #id" fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return label;
}
