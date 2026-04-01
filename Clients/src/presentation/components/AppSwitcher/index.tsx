import { FC, memo } from "react";
import { Stack, Tooltip, Box, Typography, useTheme } from "@mui/material";
import { Shield, FlaskConical, ScanSearch, Eye, Router, Crown } from "lucide-react";
import { AppModule } from "../../../application/redux/ui/uiSlice";
import "./index.css";

interface AppSwitcherProps {
  activeModule: AppModule;
  onModuleChange: (module: AppModule) => void;
  isSuperAdmin?: boolean;
}

interface ModuleItem {
  id: AppModule;
  icon: React.ReactNode;
  label: string;
  description: string;
  disabled?: boolean;
}

const modules: ModuleItem[] = [
  {
    id: "main",
    icon: <Shield size={16} strokeWidth={1.5} />,
    label: "Governance",
    description: "Centralized AI governance, risk, and compliance platform",
  },
  {
    id: "evals",
    icon: <FlaskConical size={16} strokeWidth={1.5} />,
    label: "LLM Evals",
    description: "Evaluate LLM quality, performance and reliability over time",
  },
  {
    id: "ai-detection",
    icon: <ScanSearch size={16} strokeWidth={1.5} />,
    label: "AI Detection",
    description: "Scan repositories to detect AI/ML libraries and frameworks",
  },
  {
    id: "shadow-ai",
    icon: <Eye size={16} strokeWidth={1.5} />,
    label: "Shadow AI",
    description: "Detect and govern unauthorized AI tool usage across your organization",
  },
  {
    id: "ai-gateway",
    icon: <Router size={16} strokeWidth={1.5} />,
    label: "AI Gateway",
    description: "Proxy, monitor, and control LLM API usage across providers",
  },
];

const superAdminModule: ModuleItem = {
  id: "super-admin",
  icon: <Crown size={16} strokeWidth={1.5} />,
  label: "Super Admin",
  description: "Manage organizations, users, and system-level settings",
};

const AppSwitcher: FC<AppSwitcherProps> = ({
  activeModule,
  onModuleChange,
  isSuperAdmin = false,
}) => {
  const theme = useTheme();

  const allModules = isSuperAdmin ? [...modules, superAdminModule] : modules;

  return (
    <Stack className="app-switcher">
      <Stack className="app-switcher-modules">
        {allModules.map((module) => (
          <Tooltip
            key={module.id}
            title={
              <Box sx={{ p: 0.5 }}>
                <Typography sx={{ fontSize: theme.typography.caption.fontSize, fontWeight: 600, mb: 0.5 }}>
                  {module.label}
                  {module.disabled && " (Coming soon)"}
                </Typography>
                <Typography sx={{ fontSize: theme.typography.caption.fontSize, opacity: 0.9 }}>
                  {module.description}
                </Typography>
              </Box>
            }
            placement="right"
            arrow
            enterDelay={1000}
            enterNextDelay={1000}
            disableInteractive
            slotProps={{
              tooltip: {
                sx: {
                  bgcolor: "grey.900",
                  maxWidth: 220,
                  "& .MuiTooltip-arrow": {
                    color: theme.palette.grey[900],
                  },
                },
              },
            }}
          >
            {module.disabled ? (
              <span style={{ display: "inline-block" }}>
                <button
                  className={`app-switcher-icon ${
                    activeModule === module.id ? "active" : ""
                  } ${module.disabled ? "disabled" : ""}`}
                  onClick={() => !module.disabled && onModuleChange(module.id)}
                  disabled={module.disabled}
                  aria-label={module.label}
                >
                  {module.icon}
                </button>
              </span>
            ) : (
              <button
                className={`app-switcher-icon ${
                  activeModule === module.id ? "active" : ""
                } ${module.disabled ? "disabled" : ""}`}
                onClick={() => !module.disabled && onModuleChange(module.id)}
                disabled={module.disabled}
                aria-label={module.label}
              >
                {module.icon}
              </button>
            )}
          </Tooltip>
        ))}
      </Stack>
    </Stack>
  );
};

export default memo(AppSwitcher);
