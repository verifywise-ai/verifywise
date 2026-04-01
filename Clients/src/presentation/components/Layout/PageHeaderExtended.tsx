
import { Stack, Box, Typography } from "@mui/material";
import { PageBreadcrumbs } from "../breadcrumbs/PageBreadcrumbs";
import HelperIcon from "../HelperIcon";
import { PageHeader } from "./PageHeader";
import TipBox from "../TipBox";
import { pageHeaderSummaryCardsStyle } from "./style";
import { PageHeaderExtendedProps } from "src/presentation/types/interfaces/i.header";
import { useAuth } from "../../../application/hooks/useAuth";
import { useLocation } from "react-router-dom";

export function PageHeaderExtended({
    title,
    description,
    helpArticlePath,
    tipBoxEntity,
    summaryCards,
    summaryCardsJoyrideId,
    children,
    alert,
    loadingToast,
    titleFontFamily,
    breadcrumbItems,
    actionButton = null,
}: PageHeaderExtendedProps) {
    const { isSuperAdmin, activeOrganizationId } = useAuth();
    const location = useLocation();
    const isSuperAdminRoute = location.pathname.startsWith("/super-admin");
    const showNoOrgMessage = isSuperAdmin && !activeOrganizationId && !isSuperAdminRoute;

    return (
        <Stack className="vwhome" gap={0}>
            <PageBreadcrumbs items={breadcrumbItems} sx={{ mb: 0, "& > hr": { mb: 0 } }} />

            <Box sx={{ mt: "16px" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <PageHeader
                        title={title}
                        description={description}
                        titleFontFamily={titleFontFamily}
                    rightContent={
                            helpArticlePath ? (
                                <HelperIcon articlePath={helpArticlePath} size="small" />
                            ) : undefined
                        }
                    />
                    {!showNoOrgMessage && actionButton && <Box sx={{ flexShrink: 0 }}>{actionButton}</Box>}
                </Stack>
            </Box>

            {showNoOrgMessage ? (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        py: 16,
                    }}
                >
                    <Typography variant="body1" sx={{ color: "text.secondary" }}>
                        No organizations exist yet. Switch to the Super Admin tab to create one.
                    </Typography>
                </Box>
            ) : (
                <>
                    {/* Alerts/toasts rendered outside the gap Stack so they don't affect layout */}
                    {alert}
                    {loadingToast}

                    {(tipBoxEntity || summaryCards) && (
                        <Stack gap="18px" sx={{ mt: "18px" }}>
                            {tipBoxEntity && <TipBox entityName={tipBoxEntity} />}
                            {summaryCards && (
                                <Box
                                    data-joyride-id={summaryCardsJoyrideId}
                                    sx={pageHeaderSummaryCardsStyle}
                                >
                                    {summaryCards}
                                </Box>
                            )}
                        </Stack>
                    )}
                    <Stack gap="16px" sx={{ mt: "16px" }}>
                        {children}
                    </Stack>
                </>
            )}
        </Stack>
    );
}