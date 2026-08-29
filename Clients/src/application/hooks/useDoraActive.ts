import { useMemo } from "react";
import { useProjects } from "./useProjects";
import { Project } from "../../domain/types/Project";

interface UseDoraActiveResult {
  doraActive: boolean;
  loading: boolean;
}

// DORA (Digital Operational Resilience Act) framework identity.
// DORA is an org-level ("is_organizational") framework, keyed by id 9.
const DORA_FRAMEWORK_ID = 9;
const DORA_FRAMEWORK_KEY = "dora";

type ProjectFrameworkLink = Project["framework"][number] & {
  framework_key?: string;
};

const isDoraFrameworkLink = (link: ProjectFrameworkLink): boolean => {
  if (link.framework_id !== undefined && link.framework_id !== null) {
    return Number(link.framework_id) === DORA_FRAMEWORK_ID;
  }
  if (link.framework_key) {
    return link.framework_key.toLowerCase() === DORA_FRAMEWORK_KEY;
  }
  if (link.name) {
    return link.name.toLowerCase().includes(DORA_FRAMEWORK_KEY);
  }
  return false;
};

/**
 * Visibility gate for DORA (Digital Operational Resilience Act) UI.
 *
 * Returns `doraActive: true` ONLY when the DORA framework is actually
 * INSTALLED/ASSIGNED for the current organization — i.e. present on the
 * org's organizational project's `framework` list — NOT merely present in
 * the frameworks catalog (which contains DORA for every org).
 *
 * Any UI gated by DORA (vendor-form sections, the ICT register tab, etc.)
 * MUST use this hook rather than the frameworks catalog, or DORA UI will
 * leak to organizations that do not have DORA active.
 *
 * Deliberately reads from `useProjects()` (a React Query hook with its own
 * cache keyed on `["projects", "list"]`) rather than `VerifyWiseContext.projects`.
 * The context array is shared, mutable app-wide state written by several
 * unrelated components (project create/edit/delete flows, the dashboard
 * bootstrap fetch, etc.) — some of those legitimately hold filtered or
 * stale snapshots for their own purposes. Coupling this gate to that shared
 * array made it vulnerable to any future writer transiently narrowing it
 * (e.g. to non-organizational projects only), which would flip DORA UI off
 * mid-session even though DORA is installed. `useProjects()` is fetched and
 * cached independently, is not written to by any other component, and is
 * already the source `Vendors/index.tsx` and `NewVendor` use for their own
 * project data — so this hook now shares that same, uncontaminated source.
 */
const useDoraActive = (): UseDoraActiveResult => {
  const { data: projects, isLoading } = useProjects();

  const doraActive = useMemo(() => {
    if (!projects || projects.length === 0) {
      return false;
    }

    const organizationalProjects = projects.filter((project) => project.is_organizational === true);

    return organizationalProjects.some((project) =>
      (project.framework ?? []).some((link) => isDoraFrameworkLink(link as ProjectFrameworkLink)),
    );
  }, [projects]);

  // Fail-closed: while the query is still loading (or projects is
  // undefined/empty for any other reason) doraActive resolves to false, the
  // same as "DORA not installed" — this hook never latches or infers `true`
  // from a prior render, so it cannot leak DORA UI to an org that doesn't
  // have it active.
  return { doraActive, loading: isLoading };
};

export default useDoraActive;
