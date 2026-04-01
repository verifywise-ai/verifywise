import { useState, useEffect, useCallback } from "react";
import {
  Stack,
  Typography,
  Button,
  Select as MuiSelect,
  MenuItem,
  SelectChangeEvent,
  useTheme,
} from "@mui/material";
import { ChevronDown, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../application/hooks/useAuth";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../../application/redux/store";
import { setActiveOrganizationId } from "../../../application/redux/auth/authSlice";
import {
  getOrganizations,
  Organization,
} from "../../../application/repository/superAdmin.repository";
import { getSelectStyles } from "../../utils/inputStyles";
import { status, background, text } from "../../themes/palette";

const ReadOnlyBanner = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isSuperAdmin, activeOrganizationId } = useAuth();
  const activeModule = useSelector(
    (state: RootState) => state.ui?.appModule?.active ?? "main"
  );

  const [orgs, setOrgs] = useState<Organization[]>([]);

  const fetchOrgs = useCallback(async () => {
    try {
      const response = await getOrganizations();
      const serverData = response.data as any;
      setOrgs(serverData?.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchOrgs();
  }, [isSuperAdmin, fetchOrgs]);

  // If the active org no longer exists (deleted), clear it and go to super-admin
  useEffect(() => {
    if (!isSuperAdmin || orgs.length === 0) return;
    if (activeOrganizationId && !orgs.find((o) => o.id === activeOrganizationId)) {
      dispatch(setActiveOrganizationId(null));
      navigate("/super-admin");
    }
  }, [isSuperAdmin, orgs, activeOrganizationId, dispatch, navigate]);

  if (!isSuperAdmin || !activeOrganizationId || activeModule === "super-admin")
    return null;

  const handleOrgChange = (event: SelectChangeEvent<number>) => {
    const newOrgId = Number(event.target.value);
    if (!newOrgId) return;
    dispatch(setActiveOrganizationId(newOrgId));
    // Reload so all page data refetches with the new org context
    if (newOrgId !== activeOrganizationId) {
      window.location.reload();
    }
  };

  const itemStyles = {
    fontSize: 13,
    color: theme.palette.text.tertiary,
    borderRadius: theme.shape.borderRadius,
    margin: "4px 8px",
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{
        py: "6px",
        px: 2,
        backgroundColor: status.info.bg,
        borderBottom: `1px solid ${status.info.border}`,
        minHeight: 36,
      }}
    >
      <Eye size={14} color={status.info.text} style={{ flexShrink: 0 }} />
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 500,
          color: status.info.text,
        }}
      >
        Super Admin view (read-only) — edits are disabled to protect organization data
      </Typography>

      <MuiSelect<number>
        value={activeOrganizationId}
        onChange={handleOrgChange}
        displayEmpty
        IconComponent={() => (
          <ChevronDown
            size={16}
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: text.tertiary,
            }}
          />
        )}
        MenuProps={{
          disableScrollLock: true,
          style: { zIndex: 10001 },
          PaperProps: {
            sx: {
              maxHeight: 240,
              borderRadius: theme.shape.borderRadius,
              boxShadow: theme.boxShadow,
              mt: 1,
              "& .MuiMenuItem-root": {
                fontSize: 13,
                color: theme.palette.text.primary,
                transition: "color 0.2s ease, background-color 0.2s ease",
                "&:hover": {
                  backgroundColor: theme.palette.background.accent,
                  color: theme.palette.primary.main,
                },
                "&.Mui-selected": {
                  backgroundColor: theme.palette.background.accent,
                  "&:hover": {
                    backgroundColor: theme.palette.background.accent,
                    color: theme.palette.primary.main,
                  },
                },
                "& .MuiTouchRipple-root": {
                  display: "none",
                },
              },
            },
          },
        }}
        sx={{
          fontSize: 13,
          minWidth: 160,
          maxWidth: 240,
          height: 28,
          backgroundColor: background.main,
          position: "relative",
          cursor: "pointer",
          ...getSelectStyles(theme),
          "& .MuiSelect-select": {
            py: "3px",
            pr: "32px !important",
          },
        }}
      >
        {orgs.map((org) => (
          <MenuItem key={org.id} value={org.id} sx={itemStyles}>
            {org.name}
          </MenuItem>
        ))}
      </MuiSelect>

      <Button
        size="small"
        variant="outlined"
        onClick={() => navigate("/super-admin")}
        sx={{
          textTransform: "none",
          fontSize: 12,
          fontWeight: 600,
          minWidth: "auto",
          px: 1.5,
          py: 0.25,
          color: status.info.text,
          borderColor: status.info.text,
          borderRadius: theme.shape.borderRadius,
          "&:hover": {
            color: text.primary,
            borderColor: text.primary,
            backgroundColor: "transparent",
          },
        }}
      >
        Manage organizations
      </Button>
    </Stack>
  );
};

export default ReadOnlyBanner;
