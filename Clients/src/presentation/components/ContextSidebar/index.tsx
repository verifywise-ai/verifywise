import { useLocation, useNavigate } from "react-router-dom";
import { AppModule } from "../../../application/redux/ui/uiSlice";
import { useEvalsSidebarContextSafe } from "../../../application/contexts/EvalsSidebar.context";
import { useAIDetectionSidebarContextSafe } from "../../../application/contexts/AIDetectionSidebar.context";
import { useShadowAISidebarContextSafe } from "../../../application/contexts/ShadowAISidebar.context";
import { useAIGatewaySidebarContextSafe } from "../../../application/contexts/AIGatewaySidebar.context";
import { useAITrustIndexSidebarContextSafe } from "../../../application/contexts/AITrustIndexSidebar.context";
import Sidebar from "../Sidebar";
import SuperAdminSidebar from "../SuperAdminSidebar";
import EvalsSidebar from "../../pages/EvalsDashboard/EvalsSidebar";
import AIDetectionSidebar from "../../pages/AIDetection/AIDetectionSidebar";
import ShadowAISidebar from "../../pages/ShadowAI/ShadowAISidebar";
import AIGatewaySidebar from "../../pages/AIGateway/AIGatewaySidebar";
import AITrustIndexSidebar from "../../pages/AITrustIndex/AITrustIndexSidebar";

interface ContextSidebarProps {
  activeModule: AppModule;
  // Props for main Sidebar
  onOpenCreateDemoData?: () => void;
  onOpenDeleteDemoData?: () => void;
  onDismissDemoDataButton?: () => void;
  showDemoDataButton?: boolean;
  hasDemoData?: boolean;
  /** Only show demo data options to admins */
  isAdmin?: boolean;
}

/**
 * ContextSidebar renders the appropriate sidebar based on the active module.
 * - 'main': Renders the main VerifyWise sidebar
 * - 'evals': Renders EvalsSidebar (state provided via EvalsSidebarContext)
 * - 'ai-detection': Renders AIDetectionSidebar
 */
export function ContextSidebar({
  activeModule,
  onOpenCreateDemoData,
  onOpenDeleteDemoData,
  onDismissDemoDataButton,
  showDemoDataButton = true,
  hasDemoData,
  isAdmin = false,
}: ContextSidebarProps) {
  const evalsSidebarContext = useEvalsSidebarContextSafe();
  const aiDetectionSidebarContext = useAIDetectionSidebarContextSafe();
  const shadowAiSidebarContext = useShadowAISidebarContextSafe();
  const aiGatewaySidebarContext = useAIGatewaySidebarContextSafe();
  const aiTrustIndexSidebarContext = useAITrustIndexSidebarContextSafe();
  const location = useLocation();
  const navigate = useNavigate();

  // Get active tab from URL hash for evals
  const activeTab = location.hash.replace("#", "") || "overview";

  // Handle tab change by navigating to the new hash
  // If we have a selected project but aren't on a project-specific URL, navigate to the project
  const handleTabChange = (newTab: string) => {
    const pathParts = location.pathname.split("/");
    const hasProjectInUrl = pathParts.length > 2 && pathParts[2]; // /evals/:projectId

    // If there's no project in URL but we have a selected project, navigate to that project
    if (!hasProjectInUrl && evalsSidebarContext?.currentProject) {
      navigate(`/evals/${evalsSidebarContext.currentProject.id}#${newTab}`);
    } else {
      navigate(`${location.pathname}#${newTab}`);
    }
  };

  switch (activeModule) {
    case "main":
      return (
        <Sidebar
          onOpenCreateDemoData={onOpenCreateDemoData}
          onOpenDeleteDemoData={onOpenDeleteDemoData}
          onDismissDemoDataButton={onDismissDemoDataButton}
          showDemoDataButton={showDemoDataButton}
          hasDemoData={hasDemoData}
          isAdmin={isAdmin}
        />
      );
    case "evals":
      // Render EvalsSidebar - use URL hash for active tab, context for counts
      return (
        <EvalsSidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          experimentsCount={evalsSidebarContext?.experimentsCount ?? 0}
          datasetsCount={evalsSidebarContext?.datasetsCount ?? 0}
          scorersCount={evalsSidebarContext?.scorersCount ?? 0}
          modelsCount={evalsSidebarContext?.modelsCount ?? 0}
          arenaCount={evalsSidebarContext?.arenaCount ?? 0}
          disabled={evalsSidebarContext?.disabled ?? true}
          recentExperiments={evalsSidebarContext?.recentExperiments ?? []}
          recentProjects={evalsSidebarContext?.recentProjects ?? []}
          onExperimentClick={evalsSidebarContext?.onExperimentClick}
          onProjectClick={evalsSidebarContext?.onProjectClick}
          currentProject={evalsSidebarContext?.currentProject}
          allProjects={evalsSidebarContext?.allProjects ?? []}
          onProjectChange={evalsSidebarContext?.onProjectChange}
        />
      );
    case "ai-detection": {
      // Get active tab from URL path for ai-detection
      const aiDetectionTab = location.pathname.includes("/ai-detection/repositories")
        ? "repositories"
        : location.pathname.includes("/ai-detection/history")
          ? "history"
          : location.pathname.includes("/ai-detection/settings")
            ? "settings"
            : location.pathname.includes("/ai-detection/scans/")
              ? "history"
              : "scan";

      const handleAIDetectionTabChange = (newTab: string) => {
        if (newTab === "scan") {
          navigate("/ai-detection/scan");
        } else if (newTab === "repositories") {
          navigate("/ai-detection/repositories");
        } else if (newTab === "history") {
          navigate("/ai-detection/history");
        } else if (newTab === "settings") {
          navigate("/ai-detection/settings");
        }
      };

      return (
        <AIDetectionSidebar
          activeTab={aiDetectionTab}
          onTabChange={handleAIDetectionTabChange}
          historyCount={aiDetectionSidebarContext?.historyCount ?? 0}
          repositoryCount={aiDetectionSidebarContext?.repositoryCount ?? 0}
          recentScans={aiDetectionSidebarContext?.recentScans ?? []}
          onScanClick={(scanId) => navigate(`/ai-detection/scans/${scanId}`)}
        />
      );
    }
    case "shadow-ai": {
      const shadowAiTab = location.pathname.includes("/shadow-ai/user-activity")
        ? "users"
        : location.pathname.includes("/shadow-ai/tools")
          ? "tools"
          : location.pathname.includes("/shadow-ai/rules")
            ? "rules"
            : location.pathname.includes("/shadow-ai/settings")
              ? "settings"
              : "insights";

      const handleShadowAiTabChange = (newTab: string) => {
        if (newTab === "insights") {
          navigate("/shadow-ai/insights");
        } else if (newTab === "users") {
          navigate("/shadow-ai/user-activity/users");
        } else {
          navigate(`/shadow-ai/${newTab}`);
        }
      };

      return (
        <ShadowAISidebar
          activeTab={shadowAiTab}
          onTabChange={handleShadowAiTabChange}
          toolsCount={shadowAiSidebarContext?.toolsCount ?? 0}
          alertsCount={shadowAiSidebarContext?.alertsCount ?? 0}
          recentTools={shadowAiSidebarContext?.recentTools ?? []}
          onToolClick={(toolId) => navigate(`/shadow-ai/tools/${toolId}`)}
        />
      );
    }
    case "ai-gateway": {
      const gatewayTab = (() => {
        const p = location.pathname;
        // MCP / Agent Control sub-routes must be checked before the broader
        // matches so a path like /ai-gateway/mcp/audit doesn't fall through.
        if (p.includes("/ai-gateway/mcp/agent-keys")) return "mcp/agent-keys";
        if (p.includes("/ai-gateway/mcp/runs")) return "mcp/runs";
        if (p.includes("/ai-gateway/mcp/audit")) return "mcp/audit";
        if (p.includes("/ai-gateway/mcp/approvals")) return "mcp/approvals";
        if (p.includes("/ai-gateway/mcp/servers")) return "mcp/servers";
        if (p.includes("/ai-gateway/mcp/tools")) return "mcp/tools";
        if (p.includes("/ai-gateway/mcp/guardrails")) return "mcp/guardrails";
        if (p.includes("/ai-gateway/dashboard")) return "dashboard";
        if (p.includes("/ai-gateway/endpoints")) return "endpoints";
        if (p.includes("/ai-gateway/playground")) return "playground";
        if (p.includes("/ai-gateway/guardrails")) return "guardrails";
        if (p.includes("/ai-gateway/prompts")) return "prompts";
        if (p.includes("/ai-gateway/models")) return "models";
        if (p.includes("/ai-gateway/logs")) return "logs";
        if (p.includes("/ai-gateway/virtual-keys")) return "virtual-keys";
        if (p.includes("/ai-gateway/settings")) return "settings";
        return "dashboard";
      })();

      const handleGatewayTabChange = (newTab: string) => {
        navigate(`/ai-gateway/${newTab}`);
      };

      return (
        <AIGatewaySidebar
          activeTab={gatewayTab}
          onTabChange={handleGatewayTabChange}
          endpointsCount={aiGatewaySidebarContext?.endpointsCount ?? 0}
          promptsCount={aiGatewaySidebarContext?.promptsCount ?? 0}
          virtualKeysCount={aiGatewaySidebarContext?.virtualKeysCount ?? 0}
        />
      );
    }
    case "ai-trust-index": {
      const trustIndexTab = location.pathname.includes("/ai-trust-index/tracked")
        ? "tracked"
        : location.pathname.includes("/ai-trust-index/settings")
          ? "settings"
          : "browse";

      const handleTrustIndexTabChange = (newTab: string) => {
        navigate(`/ai-trust-index/${newTab}`);
      };

      return (
        <AITrustIndexSidebar
          activeTab={trustIndexTab}
          onTabChange={handleTrustIndexTabChange}
          trackedCount={aiTrustIndexSidebarContext?.trackedCount ?? 0}
          isAdmin={isAdmin}
        />
      );
    }
    case "super-admin":
      return <SuperAdminSidebar />;
    default:
      return (
        <Sidebar
          onOpenCreateDemoData={onOpenCreateDemoData}
          onOpenDeleteDemoData={onOpenDeleteDemoData}
          onDismissDemoDataButton={onDismissDemoDataButton}
          showDemoDataButton={showDemoDataButton}
          hasDemoData={hasDemoData}
          isAdmin={isAdmin}
        />
      );
  }
}
