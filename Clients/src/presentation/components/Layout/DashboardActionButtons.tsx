import { useState, useMemo, memo, useCallback, useEffect, type ReactNode } from 'react';
import { Stack, IconButton, Box } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Zap, WorkflowIcon, Package, ClipboardList } from 'lucide-react';
import { useAuth } from '../../../application/hooks/useAuth';
import VWTooltip from '../VWTooltip';
import RequestorApprovalModal from '../Modals/RequestorApprovalModal';
import { ApprovalButton } from './ApprovalButton';
import NotificationBell from '../NotificationBell';
import {
  getPendingApprovals,
  getMyApprovalRequests,
} from '../../../application/repository/approvalRequest.repository';
import { actionButtonsStyles } from './style';
import './icon-shake.css';

interface DashboardActionButtonsProps {
  hideOnMainDashboard?: boolean;
}

function KeyboardBadge({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: '4px',
        padding: '2px 6px',
        fontSize: '12px',
        fontWeight: 500,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minWidth: '22px',
      }}
    >
      {children}
    </Box>
  );
}

function WiseSearchTooltipContent({ isMac }: { isMac: boolean }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <KeyboardBadge>{isMac ? '⌘' : 'Ctrl'}</KeyboardBadge>
        <KeyboardBadge>K</KeyboardBadge>
      </Box>
      <Box sx={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '13px', lineHeight: 1.5 }}>
        Search across all projects, tasks, vendors, policies, and more in your workspace.
      </Box>
    </Box>
  );
}

export const DashboardActionButtons = memo(function DashboardActionButtons({
  hideOnMainDashboard = true,
}: DashboardActionButtonsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userRoleName } = useAuth();
  const isAdmin = userRoleName === "Admin";

  // Detect if user is on Mac for keyboard shortcuts
  const isMac = useMemo(() => {
    if (typeof navigator !== 'undefined') {
      return navigator.platform?.toLowerCase().includes('mac') ||
        navigator.userAgent?.toLowerCase().includes('mac');
    }
    return false;
  }, []);

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // Check if we're on the main dashboard - memoized to prevent unnecessary re-renders
  const isMainDashboard = useMemo(
    () => location.pathname === '/' || location.pathname === '',
    [location.pathname]
  );

  const shouldHide = hideOnMainDashboard && isMainDashboard;

  const handleOpenCommandPalette = useCallback(() => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
  }, []);

  const baseStyles = {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    '&:hover svg': {
      animation: 'icon-shake 400ms ease-in-out',
    },
  };

  const [totalApprovalCount, setTotalApprovalCount] = useState(0);

  // Function to fetch approval counts
  const fetchApprovalCounts = useCallback(async () => {
    try {
      const [approvalsResponse, myRequestsResponse] = await Promise.all([
        getPendingApprovals(),
        getMyApprovalRequests(),
      ]);

      const approvalsCount = approvalsResponse?.data?.length || 0;
      const myRequestsCount = myRequestsResponse?.data?.length || 0;

      setTotalApprovalCount(approvalsCount + myRequestsCount);
    } catch (error) {
      console.error("Failed to fetch approval counts:", error);
      setTotalApprovalCount(0);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchApprovalCounts();
  }, [fetchApprovalCounts]);


  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        visibility: shouldHide ? 'hidden' : 'visible',
        opacity: shouldHide ? 0 : 1,
        pointerEvents: shouldHide ? 'none' : 'auto',
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* Wise Search */}
      <VWTooltip header="Wise Search" content={<WiseSearchTooltipContent isMac={isMac} />} placement="bottom" maxWidth={280}>
        <IconButton size="small" onClick={handleOpenCommandPalette} sx={{ ...baseStyles, ...actionButtonsStyles.search }}>
          <Search size={16} />
        </IconButton>
      </VWTooltip>

      {/* Notifications Bell */}
      <NotificationBell />

      <ApprovalButton
        label="Approval requests"
        count={totalApprovalCount}
        onClick={() => {
          setIsRequestModalOpen(true);
          // Refresh count when modal is opened to ensure it's up-to-date
          fetchApprovalCounts();
        }}
      />

      {/* Approval workflows */}
      {isAdmin && <VWTooltip
        header="Approval Workflows"
        content={"Define multi-step review and sign-off chains that run automatically when items need approval."}
        placement="bottom"
        maxWidth={200}
      >
        <span>
          <IconButton
            size="small"
            onClick={() => navigate('/approval-workflows')}
            sx={{ ...baseStyles, ...actionButtonsStyles.approval_workflows }}
          >
            <WorkflowIcon size={16} strokeWidth={2} />
          </IconButton>
        </span>
      </VWTooltip>
      }

      {/* Intake forms */}
      {isAdmin && <VWTooltip
        header="Intake forms"
        content={"Create and manage intake forms for external submissions."}
        placement="bottom"
        maxWidth={200}
      >
        <span>
          <IconButton
            size="small"
            onClick={() => navigate('/intake-forms')}
            sx={{ ...baseStyles, ...actionButtonsStyles.approval_workflows }}
          >
            <ClipboardList size={16} strokeWidth={2} />
          </IconButton>
        </span>
      </VWTooltip>
      }

      {/* Integrations */}
      <VWTooltip
        header="Plugins"
        content={isAdmin ? "Browse and manage plugins from the marketplace." : "Admin access required."}
        placement="bottom"
        maxWidth={200}
      >
        <span>
          <IconButton
            size="small"
            onClick={isAdmin ? () => navigate('/plugins/marketplace') : undefined}
            disabled={!isAdmin}
            sx={{ ...baseStyles, ...actionButtonsStyles.integrations }}
          >
            <Package size={16} />
          </IconButton>
        </span>
      </VWTooltip>

      {/* Automations */}
      <VWTooltip header="Automations" content="Set up automated workflows." placement="bottom" maxWidth={200}>
        <IconButton size="small" onClick={() => navigate('/automations')} sx={{ ...baseStyles, ...actionButtonsStyles.automations }}>
          <Zap size={16} />
        </IconButton>
      </VWTooltip>


      <RequestorApprovalModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onRefresh={fetchApprovalCounts} />
    </Stack>
  );
});

DashboardActionButtons.displayName = 'DashboardActionButtons';
