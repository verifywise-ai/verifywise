import React, { ReactNode } from "react";
import { Box, Divider, Drawer, Stack, Typography, useTheme } from "@mui/material";
import { TabContext } from "@mui/lab";
import { X, Save as SaveIcon } from "lucide-react";
import TabBar from "../../TabBar";
import { CustomizableButton } from "../../button/customizable-button";
import { drawerAccessibilityProps, DRAWER_TITLE_ID } from "../drawerAccessibility";
import { DrawerTab } from "./types";

interface DrawerFrameProps {
  open: boolean;
  onClose: (event?: React.SyntheticEvent | Record<string, never>, reason?: string) => void;
  title: ReactNode;
  tabs: DrawerTab[];
  activeTab: string;
  onTabChange: (event: React.SyntheticEvent, newValue: string) => void;
  onSave: () => void;
  isSaving?: boolean;
  saveDisabled?: boolean;
  drawerClassName?: string;
  drawerId?: string;
  children: ReactNode;
  extraFooter?: ReactNode;
}

const DRAWER_WIDTH = 850;

/**
 * Shell for all framework impl drawers: right-anchored Drawer with a header
 * (title + close), a tab bar, tab panels supplied via children, and a save
 * footer. Framework-specific logic lives outside this file.
 */
const DrawerFrame: React.FC<DrawerFrameProps> = ({
  open,
  onClose,
  title,
  tabs,
  activeTab,
  onTabChange,
  onSave,
  isSaving,
  saveDisabled,
  drawerClassName,
  drawerId,
  children,
  extraFooter,
}) => {
  const theme = useTheme();

  return (
    <Drawer
      className={drawerClassName}
      open={open}
      onClose={onClose}
      {...drawerAccessibilityProps}
      sx={{
        "width": DRAWER_WIDTH,
        "margin": 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          margin: 0,
          borderRadius: 0,
          overflowX: "hidden",
        },
      }}
      anchor="right"
      id={drawerId}
    >
      <Stack sx={{ width: DRAWER_WIDTH }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          padding="15px 20px"
        >
          <Typography id={DRAWER_TITLE_ID} fontSize={15} fontWeight={700}>
            {title}
          </Typography>
          <CustomizableButton
            variant="text"
            iconOnly
            ariaLabel="Close"
            size="medium"
            onClick={onClose}
          >
            <X size={20} />
          </CustomizableButton>
        </Stack>

        <Divider />

        <TabContext value={activeTab}>
          <Box sx={{ padding: "0 20px" }}>
            <TabBar tabs={tabs} activeTab={activeTab} onChange={onTabChange} />
          </Box>
          {children}
        </TabContext>

        <Stack
          direction="row"
          justifyContent="flex-end"
          alignItems="center"
          sx={{ padding: "15px 20px", marginTop: "auto", gap: "12px" }}
        >
          {extraFooter}
          <CustomizableButton
            variant="contained"
            text="Save"
            sx={{
              backgroundColor: "primary.main",
              border: `1px solid ${theme.palette.primary.main}`,
              gap: 2,
              minWidth: "120px",
              height: "36px",
            }}
            onClick={onSave}
            icon={<SaveIcon size={16} />}
            isDisabled={saveDisabled || isSaving}
          />
        </Stack>
      </Stack>
    </Drawer>
  );
};

export default DrawerFrame;
