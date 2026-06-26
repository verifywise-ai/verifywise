/**
 * @fileoverview Regulations Tracker module entry.
 *
 * The module sidebar is mounted by the shared ContextSidebar (keyed on the
 * active module), exactly like AI Trust Index — so there is no per-page shell.
 * This entry simply redirects the bare /regulations-tracker path to the Browse tab.
 *
 * @module pages/RegulationsTracker
 */

import { Navigate } from "react-router-dom";

export default function RegulationsTracker() {
  return <Navigate to="/regulations-tracker/browse" replace />;
}
