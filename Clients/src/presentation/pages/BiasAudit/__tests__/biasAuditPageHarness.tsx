/**
 * Mounts the bias audit page the way the dashboard does: under its route,
 * inside the sidebar provider, with links that navigate exactly as the module
 * sidebar does (the sidebar itself is tested in BiasAuditSidebar.test.tsx).
 */
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes, useNavigate } from "react-router";
import {
  BiasAuditSidebarProvider,
  useBiasAuditSidebarContextSafe,
} from "../../../../application/contexts/BiasAuditSidebar.context";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import BiasAuditPage from "..";
import { BIAS_AUDIT_SECTIONS, sectionPath } from "../sections";

const LABELS = { profile: "Profile", runs: "Runs", scope: "Scope determination" } as const;

const SectionLinks = () => {
  const navigate = useNavigate();
  const sidebar = useBiasAuditSidebarContextSafe();
  return (
    <nav aria-label="Bias audit sections">
      {BIAS_AUDIT_SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          data-testid={`section-${section}`}
          onClick={() => navigate(sectionPath(sidebar?.projectId ?? null, section))}
        >
          {LABELS[section]}
        </button>
      ))}
    </nav>
  );
};

export function renderBiasAuditPage(route = "/bias-audit") {
  return renderWithProviders(
    <BiasAuditSidebarProvider>
      <Routes>
        <Route
          path="/bias-audit/:projectId?/:section?"
          element={
            <>
              <SectionLinks />
              <BiasAuditPage />
            </>
          }
        />
      </Routes>
    </BiasAuditSidebarProvider>,
    { route },
  );
}

export function openSection(section: keyof typeof LABELS) {
  fireEvent.click(screen.getByTestId(`section-${section}`));
}
