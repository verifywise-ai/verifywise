import { Stack, Box } from "@mui/material";
import { Outlet } from "react-router";
import AppSwitcher from "../../components/AppSwitcher";
import SuperAdminSidebar from "../../components/SuperAdminSidebar";
import { useActiveModule } from "../../../application/hooks/useActiveModule";
import { useAuth } from "../../../application/hooks/useAuth";

const SuperAdminLayout = () => {
  const { activeModule, setActiveModule } = useActiveModule();
  const { organizationId } = useAuth();

  return (
    <Stack
      sx={{
        maxWidth: "100%",
        flexDirection: "row",
        gap: 0,
        backgroundColor: "#FCFCFD",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <AppSwitcher
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        isSuperAdmin
        hasOrg={!!organizationId}
      />
      <SuperAdminSidebar />
      <Stack
        sx={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            // Right padding clears the fixed 40px User Guide tab strip so
            // action buttons/columns don't render underneath it.
            padding: "24px 56px 24px 24px",
          }}
        >
          <Outlet />
        </Box>
      </Stack>
    </Stack>
  );
};

export default SuperAdminLayout;
