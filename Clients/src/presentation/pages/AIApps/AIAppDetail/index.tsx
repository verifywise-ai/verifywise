import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Skeleton, Stack } from "@mui/material";
import { Bot } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import { useAiApp, useUpdateAiAppStatus } from "../../../../application/hooks/useAiApps";
import { AiAppStatus } from "../../../../domain/enums/aiApp.enum";
import { palette } from "../../../themes/palette";
import Alert from "../../../components/Alert";
import AIAppApprovalCenter from "./AIAppApprovalCenter";
import AIAppPolicyMapping from "./AIAppPolicyMapping";
import AIAppModelDependencies from "./AIAppModelDependencies";
import AIAppRiskAssessment from "./AIAppRiskAssessment";

const sectionCardStyle = {
  border: `1px solid ${palette.border.dark}`,
  borderRadius: "4px",
  padding: "24px",
  backgroundColor: palette.background.main,
};

export default function AIAppDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const appId = id ? parseInt(id, 10) : null;

  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  const { data: app, isLoading, error } = useAiApp(appId);
  const updateStatusMutation = useUpdateAiAppStatus();

  const handleBack = useCallback(() => {
    navigate("/ai-apps");
  }, [navigate]);

  const handleStatusChange = useCallback(
    async (status: AiAppStatus) => {
      if (!appId) return;
      try {
        await updateStatusMutation.mutateAsync({ id: appId, status });
        setAlert({ variant: "success", body: "Status updated successfully" });
      } catch (err) {
        setAlert({ variant: "error", body: "Failed to update status" });
      }
    },
    [appId, updateStatusMutation],
  );

  if (isLoading) {
    return (
      <PageHeaderExtended title="AI app details" description="Approval center and governance">
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: "4px" }} />
      </PageHeaderExtended>
    );
  }

  if (error || !app) {
    return (
      <PageHeaderExtended title="AI app details" description="Approval center and governance">
        <EmptyState icon={Bot} message="AI app not found or failed to load." showBorder />
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended title="AI app details" description="Approval center and governance">
      <Stack gap="24px">
        <Box sx={sectionCardStyle}>
          <AIAppApprovalCenter
            app={app}
            onBack={handleBack}
            onStatusChange={handleStatusChange}
            isUpdatingStatus={updateStatusMutation.isPending}
          />
        </Box>

        <Box sx={sectionCardStyle}>
          <AIAppPolicyMapping appId={app.id!} appName={app.name} policies={app.policies || []} />
        </Box>

        <Box sx={sectionCardStyle}>
          <AIAppModelDependencies appId={app.id!} models={app.models || []} />
        </Box>

        <Box sx={sectionCardStyle}>
          <AIAppRiskAssessment appId={app.id!} currentRiskScore={app.risk_score} />
        </Box>

        {alert && (
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast
            onClick={() => setAlert(null)}
          />
        )}
      </Stack>
    </PageHeaderExtended>
  );
}
