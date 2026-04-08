import { useState, useEffect } from "react";
import {
  Stack,
  Typography,
  Select,
  MenuItem,
  SelectChangeEvent,
  useTheme,
} from "@mui/material";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../application/hooks/useAuth";
import { setActiveOrganizationId } from "../../../application/redux/auth/authSlice";
import {
  getOrganizations,
  Organization,
} from "../../../application/repository/superAdmin.repository";

const OrgSwitcher = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isSuperAdmin, activeOrganizationId } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    getOrganizations()
      .then((res) => {
        const serverData = res.data as any;
        setOrganizations(serverData?.data || []);
      })
      .catch(console.error);
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  const handleChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    if (value === "exit") {
      dispatch(setActiveOrganizationId(null));
      navigate("/super-admin");
    } else {
      dispatch(setActiveOrganizationId(parseInt(value)));
      navigate("/");
    }
  };

  return (
    <Stack
      sx={{
        px: 2,
        py: 1,
        borderBottom: 1,
        borderColor: theme.palette.border.light,
        backgroundColor: theme.palette.background.main,
      }}
    >
      <Typography variant="caption" sx={{ mb: 0.5, fontWeight: 600 }}>
        View Organization
      </Typography>
      <Select
        size="small"
        value={activeOrganizationId ? String(activeOrganizationId) : ""}
        onChange={handleChange}
        displayEmpty
        sx={{ fontSize: 13, height: 32 }}
      >
        <MenuItem value="" disabled>
          Select an organization...
        </MenuItem>
        {organizations.map((org) => (
          <MenuItem key={org.id} value={String(org.id)}>
            {org.name}
          </MenuItem>
        ))}
        {activeOrganizationId && (
          <MenuItem value="exit" sx={{ color: "error.main", fontWeight: 500 }}>
            Back to Admin Panel
          </MenuItem>
        )}
      </Select>
    </Stack>
  );
};

export default OrgSwitcher;
