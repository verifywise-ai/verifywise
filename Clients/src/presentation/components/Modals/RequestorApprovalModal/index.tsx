import {
    Check,
    ChevronRight,
    User,
    Calendar,
    ClipboardCheck,
} from "lucide-react";

import { Box, Divider, List, ListItemButton, ListItemText, Stack, Tooltip, Typography, Chip, Link, AccordionSummary, Accordion, AccordionDetails, Button } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import {
    sidebarContainer,
    sidebarMenuStyle,
    sidebarInnerStack,
    listStyle,
    getAccordionStyleWithIndex,
    groupTypographyStyle,
    tooltipStyle,
    listItemButtonStyle,
    listItemTextStyle,
    horizontalDividerStyle,
    verticalDividerStyle,
    timelineContainer,
    stepCircleStyle,
    stepContainerStyle,
    stepDateStyle,
    stepTitleStyle,
    stepDividerStyle,
    stepDetailsStack,
    approverNameStyle,
    seeDetailsLinkStyle,
    commentLabelStyle,
    commentTextStyle,
    commentFieldStyle,
    withdrawalBodyStyle,
} from './style';
import StandardModal from "../StandardModal";
import { useTheme } from "@mui/material";
import type { FC } from "react";
import React, { useEffect, useState } from "react";
import { ApprovalStatus, ApprovalStepStatus } from "../../../../domain/enums/aiApprovalWorkflow.enum";
import StepDetailsModal from './StepDetailsModal';
import dayjs from "dayjs";
import DualButtonModal from "../../Dialogs/ConfirmationModal";
import Field from "../../Inputs/Field";
import { IMenuItemExtended, IRequestorApprovalProps, IStepDetails, ITimelineStep } from "src/domain/interfaces/i.approvalForkflow";
import TabBar, { TabItem } from "../../TabBar";
import {
    getPendingApprovals,
    getMyApprovalRequests,
    getApprovalRequestById,
    approveRequest,
    rejectRequest,
    withdrawRequest,
} from "../../../../application/repository/approvalRequest.repository";
import { logEngine } from "../../../../application/tools/log.engine";
import { EmptyState } from "../../EmptyState";
import DetailField from "./DetailField";
import EntityDetailsSection from "./EntityDetailsSection";
import { extractEntityDetails } from "./entityTypeConfig";
import { dispatchFileApprovalChanged } from "../../../../application/events/fileEvents";
import { background } from "../../../themes/palette";


const getWorkflowChipProps = (value: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
        [ApprovalStatus.APPROVED]: {
            bg: "#E6F4EA",
            color: "#2E7D32",
        },
        [ApprovalStatus.REJECTED]: {
            bg: "#FDECEA",
            color: "#C62828",
        },
        [ApprovalStatus.PENDING]: {
            bg: "#FFF9E6",
            color: "#F57C00",
        },
        "withdrawn": {
            bg: `${background.surface}`,
            color: "#616161",
        },
    };

    const style = styles[value] || { bg: `${background.surface}`, color: "#616161" };

    return {
        label: value.charAt(0).toUpperCase() + value.slice(1),
        size: "small" as const,
        sx: {
            backgroundColor: style.bg,
            color: style.color,
            fontWeight: 600,
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderRadius: "4px",
            height: "22px",
            "& .MuiChip-label": {
                padding: "0 8px",
            },
        },
    };
};

const RequestorApprovalModal: FC<IRequestorApprovalProps> = ({
    isOpen,
    onClose,
    onRefresh,
}) => {

    const [isStepDetailsModalOpen, setIsStepDetailsModalOpen] = useState(false);
    const [selectedStepDetails, setSelectedStepDetails] = useState<IStepDetails | null>(null);
    const [selectedItem, setSelectedItem] = useState<IMenuItemExtended | null>(null);
    const [comment, setComment] = useState<string>("");
    const [isWithdrawConfirmationOpen, setIsWithdrawConfirmationOpen] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        "PENDING": true,
        "COMPLETED": false,
    });
    const [activeTab, setActiveTab] = useState<string>("approvals");
    const [isProcessing, setIsProcessing] = useState(false);

    const [requestsToApprove, setRequestsToApprove] = useState<IMenuItemExtended[]>([]);
    const [myPendingRequests, setMyPendingRequests] = useState<IMenuItemExtended[]>([]);
    const [timelineData, setTimelineData] = useState<ITimelineStep[]>([]);
    const [requestDetails, setRequestDetails] = useState<any>(null);

    const theme = useTheme();

    // Tab configuration
    const tabs: TabItem[] = [
        {
            label: "Pending my approval",
            value: "approvals",
            count: requestsToApprove.filter(r => r.status === 'pending').length,
        },
        {
            label: "My submissions",
            value: "pending",
            count: myPendingRequests.length,
        },
    ];

    const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
        setActiveTab(newValue);
        setSelectedItem(null);
        setComment("");
    };

    const getOverallStatus = (): 'approved' | 'rejected' | 'pending' | 'withdrawn' => {
        if (selectedItem === undefined || selectedItem === null) {
            return 'pending';
        }
        return selectedItem.status || 'pending';
    };

    const handleGroupAccordionChange = (groupName: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: isExpanded
        }));
    };

    const handleSeeDetailsClick = (_stepId: number) => {
        setSelectedStepDetails(null);
        setIsStepDetailsModalOpen(true);
    };

    const handleApprove = async () => {
        if (!selectedItem?.id || isProcessing) {
            return;
        }

        const approvedRequestId = selectedItem.id;
        setIsProcessing(true);
        try {
            await approveRequest({
                id: selectedItem.id,
                body: { comments: comment },
            });

            logEngine({
                type: "info",
                message: "Request approved successfully!",
            });

            // Clear selected item before refreshing data so the auto-select picks the next item
            setSelectedItem(null);
            await fetchRequestsData();
            setComment("");

            // Refresh the count in the header
            onRefresh?.();

            // Check if the request is still pending after approval
            // If not, it means all steps are completed and we should close the modal
            const response = await getApprovalRequestById({ id: approvedRequestId });
            const requestStatus = response?.data?.status?.toLowerCase();

            // If this was a file approval, dispatch event to refresh file lists
            if (requestDetails?.entityType === 'file') {
                dispatchFileApprovalChanged({ status: 'approved' });
            }

            if (requestStatus === 'approved') {
                onClose();
            }
        } catch (error) {
            logEngine({
                type: "error",
                message: `Failed to approve request: ${error}`,
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedItem?.id || isProcessing) return;

        setIsProcessing(true);
        try {
            await rejectRequest({
                id: selectedItem.id,
                body: { comments: comment },
            });

            logEngine({
                type: "info",
                message: "Request rejected successfully!",
            });

            // If this was a file rejection, dispatch event to refresh file lists
            if (requestDetails?.entityType === 'file') {
                dispatchFileApprovalChanged({ status: 'rejected' });
            }

            fetchRequestsData();
            setComment("");

            // Refresh the count in the header
            onRefresh?.();

            onClose();
        } catch (error) {
            logEngine({
                type: "error",
                message: `Failed to reject request: ${error}`,
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleWithdraw = async () => {
        if (!selectedItem?.id || isProcessing) return;

        setIsProcessing(true);
        try {
            setIsWithdrawConfirmationOpen(false);

            await withdrawRequest({ id: selectedItem.id });

            logEngine({
                type: "info",
                message: "Request withdrawn successfully!",
            });

            fetchRequestsData();

            // Refresh the count in the header
            onRefresh?.();

            onClose();
        } catch (error) {
            logEngine({
                type: "error",
                message: `Failed to withdraw request: ${error}`,
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleWithdrawClick = () => {
        setIsWithdrawConfirmationOpen(true);
    };

    const handleWithdrawCancel = () => {
        setIsWithdrawConfirmationOpen(false);
    }

    const fetchRequestsData = async () => {
        try {
            // Fetch requests to approve
            const approvalsResponse = await getPendingApprovals();
            const approvals = approvalsResponse?.data || [];
            setRequestsToApprove(
                approvals.map((req: any) => ({
                    id: req.id,
                    name: req.request_name,
                    path: `/approval-requests/${req.id}`,
                    status: req.status?.toLowerCase() || 'pending',
                }))
            );

            // Fetch my pending requests
            const myRequestsResponse = await getMyApprovalRequests();
            const myRequests = myRequestsResponse?.data || [];
            setMyPendingRequests(
                myRequests.map((req: any) => ({
                    id: req.id,
                    name: req.request_name,
                    path: `/approval-requests/${req.id}`,
                    status: req.status?.toLowerCase() || 'pending',
                }))
            );
        } catch (error) {
            logEngine({
                type: "error",
                message: `Failed to fetch approval requests: ${error}`,
            });
        }
    };

    const fetchTimelineData = async (requestId: number) => {
        try {
            const response = await getApprovalRequestById({ id: requestId });
            const requestData = response?.data;

            if (requestData) {
                // Extract entity details using the modular configuration
                const details = extractEntityDetails(requestData);
                setRequestDetails(details);

                if (requestData.steps) {
                    const timeline: ITimelineStep[] = requestData.steps.map((step: any, index: number) => ({
                        id: step.id,
                        title: step.step_name || `Step ${index + 1}`,
                        date: step.date_completed || step.date_assigned,
                        status: step.status?.toLowerCase() === ApprovalStepStatus.Completed ? ApprovalStepStatus.Completed : ApprovalStepStatus.Pending,
                        approverName: step.approvals?.map((a: any) => `${a.name} ${a.surname}`).join(', '),
                        approvalResult: step.approvals?.[0]?.approval_result,
                        comment: step.approvals?.[0]?.comments,
                        showDetailsLink: step.approvals && step.approvals.length > 1,
                    }));
                    setTimelineData(timeline);
                }
            }
        } catch (error) {
            logEngine({
                type: "error",
                message: `Failed to fetch timeline data: ${error}`,
            });
        }
    };

    const renderCustomFooter = () => {
        // Hide footer when there's no data or no selected item
        if (hasNoData || (!selectedItem && !isProcessing)) {
            return null;
        }

        // For "My Requests" tab - show withdraw button only for pending requests
        if (activeTab === "pending") {
            if (selectedItem?.status === 'pending') {
                return (
                    <>
                        <Box />
                        <Button
                            onClick={handleWithdrawClick}
                            color="error"
                            variant="contained"
                            disabled={isProcessing}
                        >
                            Withdraw
                        </Button>
                    </>
                );
            }
            return null;
        }

        // For "Requests to Approve" tab - show approve/reject buttons only for pending requests
        if (activeTab === "approvals" && selectedItem?.status === 'pending') {
            return (
                <Stack
                    direction="row"
                    justifyContent="flex-end"
                    spacing={8}
                    alignItems="center"
                    width="100%"
                >
                    <Button
                        onClick={handleReject}
                        color="error"
                        variant="contained"
                        disabled={isProcessing}
                    >
                        Reject
                    </Button>
                    <Button
                        onClick={handleApprove}
                        color="primary"
                        variant="contained"
                        disabled={isProcessing}
                    >
                        {isProcessing ? "Processing..." : "Approve"}
                    </Button>
                </Stack>
            );
        }

        return null;
    };

    useEffect(() => {
        if (isOpen) {
            fetchRequestsData();
        }
    }, [isOpen]);

    useEffect(() => {
        // Auto-select first item when data is loaded
        const currentList = activeTab === "approvals" ? requestsToApprove : myPendingRequests;
        if (currentList.length > 0 && !selectedItem) {
            setSelectedItem(currentList[0]);
        }
    }, [activeTab, requestsToApprove, myPendingRequests, selectedItem]);

    useEffect(() => {
        if (selectedItem?.id) {
            fetchTimelineData(selectedItem.id);
        } else {
            setRequestDetails(null);
            setTimelineData([]);
        }
    }, [selectedItem]);

    // Get current list based on active tab
    const getCurrentMenuGroups = () => {
        const currentList = activeTab === "approvals" ? requestsToApprove : myPendingRequests;

        // For "Pending my approval" tab - only show pending
        if (activeTab === "approvals") {
            const pending = currentList.filter(item => item.status === 'pending');
            return pending.length > 0 ? [{
                name: "PENDING APPROVALS",
                items: pending,
            }] : [];
        }

        // For "My submissions" tab - group by status
        const pending = currentList.filter(item => item.status === 'pending');
        const completed = currentList.filter(item => ['approved', 'rejected', 'withdrawn'].includes(item.status));

        const groups = [];

        if (pending.length > 0) {
            groups.push({
                name: "PENDING",
                items: pending,
            });
        }
        if (completed.length > 0) {
            groups.push({
                name: "COMPLETED",
                items: completed,
            });
        }

        return groups;
    };

    const menuGroups = getCurrentMenuGroups();

    // Check if current tab has any data
    const currentList = activeTab === "approvals" ? requestsToApprove : myPendingRequests;
    const hasNoData = currentList.length === 0 || menuGroups.length === 0;

    return (
        <StandardModal
            isOpen={isOpen}
            onClose={onClose}
            maxWidth="1000px"
            title="Approval requests"
            description="Review and manage approval requests"
            customFooter={renderCustomFooter()}
            expandedHeight={true}
        >
            <TabContext value={activeTab}>
                <TabBar
                    tabs={tabs}
                    activeTab={activeTab}
                    onChange={handleTabChange}
                />
                <TabPanel value={activeTab} sx={{
                    padding: "24px 0 0 0",
                    height: "480px",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                }}>
                    {hasNoData ? (
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                            <EmptyState message="No approval requests found." icon={ClipboardCheck} />
                        </Box>
                    ) : (
                    <Stack direction="row" spacing={12} sx={{ height: "100%", flex: 1 }}>
                <Box
                    width="240px"
                    sx={{
                        ...sidebarContainer,
                        height: "100%",
                        overflowY: "auto",
                        overflowX: "hidden",
                    }}
                >
                    <Stack>
                        <Stack
                            component="aside"
                            className={`sidebar-menu expanded}`}
                            py={theme.spacing(1)}
                            gap={theme.spacing(1)}
                            sx={sidebarMenuStyle(theme)}
                        >
                            <Stack
                                sx={sidebarInnerStack(theme)}
                            >
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    gap={theme.spacing(4)}
                                    className="app-title"
                                >
                                    <List
                                        component="nav"
                                        aria-labelledby="nested-menu-subheader"
                                        disablePadding
                                        sx={listStyle(theme)}
                                    >
                                        {menuGroups.map((group, index) => (
                                            <React.Fragment key={group.name}>
                                                <Accordion
                                                    expanded={expandedGroups[group.name] || false}
                                                    onChange={handleGroupAccordionChange(group.name)}
                                                    sx={getAccordionStyleWithIndex(theme, index)}
                                                >
                                                    <AccordionSummary
                                                        expandIcon={
                                                            <ChevronRight
                                                                size={16}
                                                                strokeWidth={2}
                                                                style={{
                                                                    transition: "transform 0.3s",
                                                                    transform: expandedGroups[group.name] ? "rotate(90deg)" : "rotate(0deg)",
                                                                    color: theme.palette.text.disabled,
                                                                }}
                                                            />
                                                        }
                                                    >
                                                        <Typography
                                                            variant="overline"
                                                            sx={groupTypographyStyle(theme)}
                                                        >
                                                            {group.name} ({group.items.length})
                                                        </Typography>
                                                    </AccordionSummary>
                                                    <AccordionDetails>
                                                        {group.items.map((item) => (
                                                            <Tooltip
                                                                sx={tooltipStyle}
                                                                key={item.path}
                                                                placement="right"
                                                                title={item.name}
                                                                slotProps={{
                                                                    popper: {
                                                                        modifiers: [
                                                                            {
                                                                                name: "offset",
                                                                                options: {
                                                                                    offset: [0, -16],
                                                                                },
                                                                            },
                                                                        ],
                                                                    },
                                                                }}
                                                                disableInteractive
                                                            >
                                                                <ListItemButton
                                                                    disableRipple={
                                                                        theme.components?.MuiListItemButton?.defaultProps
                                                                            ?.disableRipple
                                                                    }
                                                                    className={
                                                                        (item.id !== undefined && selectedItem?.id === item.id)
                                                                            ? "selected-path"
                                                                            : "unselected"
                                                                    }
                                                                    onClick={() => {
                                                                        if (item.id !== undefined) {
                                                                            setSelectedItem(item);
                                                                        }
                                                                    }}
                                                                    sx={listItemButtonStyle(theme, item.id !== undefined && selectedItem?.id === item.id)}
                                                                >
                                                                    <ListItemText
                                                                        sx={listItemTextStyle}
                                                                        primary={
                                                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                                                <Typography
                                                                                    sx={{
                                                                                        fontSize: "13px",
                                                                                        fontWeight: 500,
                                                                                        overflow: "hidden",
                                                                                        textOverflow: "ellipsis",
                                                                                        whiteSpace: "nowrap",
                                                                                    }}
                                                                                >
                                                                                    {item.name}
                                                                                </Typography>
                                                                                {item.status !== 'pending' && (
                                                                                    <Chip
                                                                                        {...(getWorkflowChipProps(item.status) || {})}
                                                                                        size="small"
                                                                                        sx={{
                                                                                            height: "18px",
                                                                                            fontSize: "9px",
                                                                                            "& .MuiChip-label": {
                                                                                                padding: "0 6px",
                                                                                            },
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                            </Stack>
                                                                        }
                                                                    />
                                                                </ListItemButton>
                                                            </Tooltip>
                                                        ))}
                                                    </AccordionDetails>
                                                </Accordion>
                                                {index < menuGroups.length - 1 && (
                                                    <Divider
                                                        orientation="horizontal"
                                                        flexItem
                                                        sx={horizontalDividerStyle(theme)}
                                                    />
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </List>
                                </Stack>
                            </Stack>
                        </Stack>
                    </Stack>
                </Box>
                <Divider
                    orientation="vertical"
                    flexItem
                    sx={verticalDividerStyle(theme)}
                />
                <Stack flex={1} spacing={12} direction="column" sx={{
                    ...timelineContainer,
                    height: "100%",
                    overflowY: "auto",
                    overflowX: "hidden",
                }}>
                    {/* Header with status */}
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography fontWeight={600} fontSize={18}>
                            Request details
                        </Typography>
                        <Chip {...(getWorkflowChipProps(getOverallStatus()) || {})} />
                    </Stack>

                    {/* Request metadata */}
                    {requestDetails && (
                        <>
                            {/* Request Information */}
                            <Stack spacing={8} sx={{
                                backgroundColor: "background.accent",
                                border: "1px solid status.default.border",
                                borderRadius: "8px",
                                padding: "16px",
                            }}>
                                <Typography fontWeight={600} fontSize={14} color="#374151" mb={2}>
                                    Request Information
                                </Typography>
                                {requestDetails.requester && (
                                    <DetailField
                                        icon={<User size={14} />}
                                        label="Requested by"
                                        value={requestDetails.requester}
                                    />
                                )}
                                {requestDetails.dateCreated && (
                                    <DetailField
                                        icon={<Calendar size={14} />}
                                        label="Created"
                                        value={dayjs(requestDetails.dateCreated).format("YYYY-MM-DD, HH:mm")}
                                    />
                                )}
                            </Stack>

                            {/* Entity-specific details - rendered by modular component */}
                            <EntityDetailsSection details={requestDetails} />
                        </>
                    )}

                    <Divider />

                    {/* Timeline header */}
                    <Typography fontWeight={600} fontSize={16}>
                        Approval workflow
                    </Typography>

                    {/* STEPS */}
                    <Stack spacing={6}>
                        {timelineData.map((step, stepIndex, steps) => (
                            <React.Fragment key={step.id}>
                                <Box>
                                    <Stack direction="row" spacing={8} alignItems="flex-start">
                                        <Box
                                            sx={stepCircleStyle(theme, step.status === ApprovalStepStatus.Completed)}
                                        >
                                            {step.status === ApprovalStepStatus.Completed ? (
                                                <Check size={12} color={background.main} />
                                            ) : (
                                                <Check size={12} color="#CCCCCC" strokeWidth={3} />
                                            )}
                                        </Box>
                                        <Stack direction="column" sx={stepContainerStyle} flex={1}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography sx={stepTitleStyle}>
                                                    {step.title}
                                                </Typography>
                                                {step.status === ApprovalStepStatus.Completed && step.date && (
                                                    <Typography sx={stepDateStyle}>
                                                        {dayjs(step.date).format("MMM DD, YYYY HH:mm")}
                                                    </Typography>
                                                )}
                                            </Stack>
                                            {step.approvalResult && (
                                                <Chip
                                                    {...(getWorkflowChipProps(step.approvalResult.toLowerCase()) || {})}
                                                    sx={{ mt: 4, alignSelf: "flex-start" }}
                                                />
                                            )}
                                        </Stack>
                                    </Stack>
                                    <Stack direction="row" alignItems="stretch">
                                        {stepIndex < steps.length - 1 && (
                                            <Divider
                                                orientation="vertical"
                                                flexItem
                                                sx={stepDividerStyle}
                                            />
                                        )}
                                        <Stack sx={stepDetailsStack} spacing={4} ml={2}>
                                            {step.approverName && (
                                                <Stack direction="row" spacing={4} alignItems="center">
                                                    <Typography sx={approverNameStyle}>
                                                        Approver: {step.approverName}
                                                    </Typography>
                                                </Stack>
                                            )}
                                            {step.showDetailsLink && (
                                                <Link
                                                    component="button"
                                                    variant="body2"
                                                    onClick={() => {
                                                        handleSeeDetailsClick(step.id);
                                                    }}
                                                    sx={seeDetailsLinkStyle}
                                                >
                                                    See details
                                                </Link>
                                            )}
                                            {step.comment && (
                                                <Stack direction="column" spacing={2}>
                                                    <Typography sx={commentLabelStyle}>
                                                        Comment
                                                    </Typography>
                                                    <Typography sx={commentTextStyle}>
                                                        {step.comment}
                                                    </Typography>
                                                </Stack>
                                            )}
                                        </Stack>
                                    </Stack>
                                </Box>
                            </React.Fragment>
                        ))}
                    </Stack>

                    {activeTab === "approvals" && selectedItem?.status === 'pending' && (
                        <Stack spacing={0}>
                            <Divider sx={{ mb: 8 }} />
                            <Field
                                label="Add comment (optional)"
                                rows={3}
                                type="description"
                                placeholder="Provide additional context or feedback..."
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                sx={commentFieldStyle}
                            />
                        </Stack>
                    )}
                </Stack>

                    </Stack>
                    )}
                </TabPanel>
            </TabContext>
            <StepDetailsModal
                isOpen={isStepDetailsModalOpen}
                onClose={() => {
                    setIsStepDetailsModalOpen(false);
                    setSelectedStepDetails(null);
                }}
                stepDetails={selectedStepDetails}
            />
            <DualButtonModal
                isOpen={isWithdrawConfirmationOpen}
                title="Confirm Withdrawal"
                body={
                    <Typography sx={withdrawalBodyStyle}>
                        Are you sure you want to withdraw this approval request? This action cannot be undone.
                    </Typography>
                }
                cancelText="Cancel"
                proceedText="Withdraw"
                onCancel={handleWithdrawCancel}
                onProceed={handleWithdraw}
                proceedButtonColor="error"
                proceedButtonVariant="contained"
                TitleFontSize={16}
            />
        </StandardModal>
    )
}

export default RequestorApprovalModal;
