import { Box, Stack, Typography, IconButton } from "@mui/material";
import { ArrowLeft, Bot, ShieldAlert } from "lucide-react";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import { DashboardHeaderCard } from "../../../components/Cards/DashboardHeaderCard";
import { IAIAppDetail } from "../../../../domain/interfaces/i.aiApp";
import { AiAppStatus } from "../../../../domain/enums/aiApp.enum";
import { palette } from "../../../themes/palette";
import { STATUS_OPTIONS, statusToChipProps, formatDiscoveredSource } from "../utils";

interface AIAppApprovalCenterProps {
  app: IAIAppDetail;
  onBack: () => void;
  onStatusChange: (status: AiAppStatus) => void;
  isUpdatingStatus: boolean;
}

export default function AIAppApprovalCenter({
  app,
  onBack,
  onStatusChange,
  isUpdatingStatus,
}: AIAppApprovalCenterProps) {
  const chipProps = statusToChipProps(app.status);

  return (
    <Stack gap="16px">
      <Stack direction="row" alignItems="center" gap="8px">
        <IconButton onClick={onBack} size="small">
          <ArrowLeft size={16} strokeWidth={1.5} />
        </IconButton>
        <Bot size={16} strokeWidth={1.5} color={palette.text.secondary} />
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{app.name}</Typography>
        <Chip {...chipProps} size="small" uppercase={false} />
      </Stack>

      <Box
        sx={{
          "display": "flex",
          "flexWrap": "wrap",
          "gap": "16px",
          "& > *": {
            flex: "1 1 0",
            minWidth: "140px",
          },
        }}
      >
        <DashboardHeaderCard
          title="Status"
          count={STATUS_OPTIONS.find((s) => s._id === app.status)?.name || app.status}
          disableNavigation
        />
        <DashboardHeaderCard
          title="Vendor"
          count={app.vendor?.vendor_name || "—"}
          disableNavigation
        />
        <DashboardHeaderCard
          title="Owner"
          count={app.owner ? `${app.owner.name} ${app.owner.surname}`.trim() : "—"}
          disableNavigation
        />
        <DashboardHeaderCard title="Risk score" count={app.risk_score ?? "—"} disableNavigation />
        <DashboardHeaderCard
          title="Source"
          count={formatDiscoveredSource(app.discovered_source)}
          disableNavigation
        />
        <DashboardHeaderCard
          title="Required training"
          count={app.required_training || "—"}
          disableNavigation
        />
      </Box>

      <Stack direction="row" alignItems="center" gap="8px" sx={{ mt: "8px" }}>
        <ShieldAlert size={16} strokeWidth={1.5} color={palette.text.secondary} />
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>
          Change status:
        </Typography>
        <Select
          id="ai-app-detail-status"
          value={app.status}
          onChange={(e) => onStatusChange(e.target.value as AiAppStatus)}
          items={[...STATUS_OPTIONS]}
          disabled={isUpdatingStatus}
          sx={{ width: 180 }}
        />
      </Stack>

      {app.description && (
        <Box sx={{ mt: "8px" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: "8px" }}>Description</Typography>
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            {app.description}
          </Typography>
        </Box>
      )}

      {app.departments.length > 0 && (
        <Box sx={{ mt: "8px" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: "8px" }}>Departments</Typography>
          <Stack direction="row" gap="8px" flexWrap="wrap">
            {app.departments.map((dept) => (
              <Chip
                key={dept.department}
                label={`${dept.department} (${dept.user_count})`}
                size="small"
                uppercase={false}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
