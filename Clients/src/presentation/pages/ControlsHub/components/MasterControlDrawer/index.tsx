/**
 * Controls Hub — Master Control Drawer.
 *
 * Tabbed drawer that opens when the user clicks a row in the Controls Hub
 * matrix. Tabs:
 *   - Details   → form fields (status, owner, due date, ...)
 *   - Mappings  → add/remove framework mappings     (T-030)
 *   - Evidence  → file attachments                   (T-031)
 *   - History   → change history timeline            (T-032)
 *
 * The drawer is intentionally loose about its open/close lifecycle — the
 * parent page owns the open state and passes a `masterControlId` to load.
 * When `masterControlId` is `null`, we still render the drawer (closed)
 * so MUI can animate the enter transition on the first open.
 */
import { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import { X as CloseIcon } from "lucide-react";

import TabBar, { type TabItem } from "../../../../components/TabBar";
import { useMasterControl } from "../../../../../application/hooks/useMasterControls";
import DetailsTab from "./DetailsTab";
import MappingsTab from "./MappingsTab";
import EvidenceTab from "./EvidenceTab";
import HistoryTab from "./HistoryTab";

const DRAWER_WIDTH = 800;

export type MasterControlDrawerTab =
  | "details"
  | "mappings"
  | "evidence"
  | "history";

interface MasterControlDrawerProps {
  open: boolean;
  onClose: () => void;
  masterControlId: number | null;
  initialTab?: MasterControlDrawerTab;
}

const DRAWER_TABS: TabItem[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Mappings", value: "mappings", icon: "Link" },
  { label: "Evidence", value: "evidence", icon: "FolderOpen" },
  { label: "History", value: "history", icon: "Clock" },
];

export default function MasterControlDrawer({
  open,
  onClose,
  masterControlId,
  initialTab = "details",
}: MasterControlDrawerProps) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<MasterControlDrawerTab>(initialTab);
  const { data: master, isLoading, error } = useMasterControl(masterControlId);

  // Reset to the requested initial tab whenever the drawer reopens.
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  const title = master?.title ?? "Master control";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      ModalProps={{
        "aria-labelledby": "master-control-drawer-title",
      }}
      PaperProps={{
        sx: {
          width: DRAWER_WIDTH,
          borderRadius: 0,
          overflowX: "hidden",
        },
      }}
    >
      <Stack
        sx={{ width: DRAWER_WIDTH, height: "100%" }}
        role="region"
        aria-labelledby="master-control-drawer-title"
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            padding: "15px 20px",
            minHeight: 64,
          }}
        >
          <Stack sx={{ minWidth: 0, paddingRight: 2 }}>
            <Typography
              fontSize={11}
              color={theme.palette.text.tertiary}
              sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
            >
              Master control
            </Typography>
            <Typography
              id="master-control-drawer-title"
              fontSize={15}
              fontWeight={700}
              sx={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </Typography>
          </Stack>
          <IconButton onClick={onClose} size="small" aria-label="Close drawer">
            <CloseIcon size={18} color={theme.palette.text.secondary} />
          </IconButton>
        </Stack>

        <Divider />

        {/* Tabs + body */}
        <TabContext value={activeTab}>
          <Box sx={{ padding: "0 20px" }}>
            <TabBar
              tabs={DRAWER_TABS}
              activeTab={activeTab}
              onChange={(_e, v) => setActiveTab(v as MasterControlDrawerTab)}
            />
          </Box>

          {isLoading && masterControlId ? (
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{ flex: 1, padding: "40px 20px" }}
            >
              <CircularProgress size={24} />
              <Typography
                fontSize={13}
                color={theme.palette.text.tertiary}
                sx={{ marginTop: 2 }}
              >
                Loading master control…
              </Typography>
            </Stack>
          ) : error ? (
            <Stack sx={{ padding: "20px" }}>
              <Typography color={theme.palette.status.error.text} fontSize={13}>
                Failed to load this master control. Please close the drawer and
                try again.
              </Typography>
            </Stack>
          ) : (
            <>
              <TabPanel
                value="details"
                sx={{
                  padding: "20px",
                  flex: 1,
                  overflowY: "auto",
                }}
              >
                {master ? (
                  <DetailsTab master={master} onSaved={onClose} />
                ) : (
                  <EmptyTabMessage message="Select a master control to view details." />
                )}
              </TabPanel>

              <TabPanel
                value="mappings"
                sx={{ padding: "20px", flex: 1, overflowY: "auto" }}
              >
                {master ? (
                  <MappingsTab master={master} />
                ) : (
                  <EmptyTabMessage message="Select a master control to view mappings." />
                )}
              </TabPanel>

              <TabPanel
                value="evidence"
                sx={{ padding: "20px", flex: 1, overflowY: "auto" }}
              >
                {master ? (
                  <EvidenceTab master={master} />
                ) : (
                  <EmptyTabMessage message="Select a master control to view evidence." />
                )}
              </TabPanel>

              <TabPanel
                value="history"
                sx={{ padding: "20px", flex: 1, overflowY: "auto" }}
              >
                {master ? (
                  <HistoryTab masterControlId={master.id!} />
                ) : (
                  <EmptyTabMessage message="Select a master control to view history." />
                )}
              </TabPanel>
            </>
          )}
        </TabContext>
      </Stack>
    </Drawer>
  );
}

function EmptyTabMessage({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Typography fontSize={13} color={theme.palette.text.tertiary}>
      {message}
    </Typography>
  );
}
