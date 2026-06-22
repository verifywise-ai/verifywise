/**
 * @fileoverview AI Trust Index module entry.
 *
 * The module sidebar is mounted by the shared ContextSidebar (keyed on the
 * active module), exactly like AI Detection — so there is no per-page shell.
 * This entry simply redirects the bare /ai-trust-index path to the Browse tab.
 *
 * @module pages/AITrustIndex
 */

import { Navigate } from "react-router-dom";

export default function AITrustIndex() {
  return <Navigate to="/ai-trust-index/browse" replace />;
}
