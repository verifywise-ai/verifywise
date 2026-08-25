import { useContext, useMemo } from "react";
import { VerifyWiseContext } from "../contexts/VerifyWise.context";
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
 */
const useDoraActive = (): UseDoraActiveResult => {
  const { projects } = useContext(VerifyWiseContext);

  const doraActive = useMemo(() => {
    if (!projects || projects.length === 0) {
      return false;
    }

    const organizationalProjects = projects.filter((project) => project.is_organizational === true);

    return organizationalProjects.some((project) =>
      (project.framework ?? []).some((link) => isDoraFrameworkLink(link as ProjectFrameworkLink)),
    );
  }, [projects]);

  // `projects` comes from VerifyWiseContext, which is populated once on app
  // bootstrap/login. There is no separate loading state exposed by the
  // context today, so we treat the gate as immediately resolved (false
  // until proven true) rather than introducing a new async fetch.
  return { doraActive, loading: false };
};

export default useDoraActive;
