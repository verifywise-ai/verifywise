/**
 * @fileoverview Hook for managing paginated finding lists on the Scan Details page.
 *
 * @module pages/AIDetection/ScanDetails/usePaginatedFindings
 */

import { useState } from "react";
import { Finding } from "../../../../domain/ai-detection/types";

export function usePaginatedFindings<T = Finding>(initialPage = 1) {
  const [findings, setFindings] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  return { findings, setFindings, page, setPage, totalPages, setTotalPages };
}
