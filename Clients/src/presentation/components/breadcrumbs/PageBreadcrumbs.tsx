import { memo } from "react";
import { Stack, useTheme, Divider } from "@mui/material";
import { Breadcrumbs } from "./index";
import { PageBreadcrumbsProps } from "../../types/breadcrumbs.types";
import { DashboardActionButtons } from "../Layout/DashboardActionButtons";

/**
 * A standardized PageBreadcrumbs component that follows the application's design patterns.
 * This component provides consistent breadcrumb styling and behavior across all pages.
 *
 * Features:
 * - Auto-generation from current route
 * - Customizable route mappings
 * - Accessible navigation with proper ARIA labels
 * - Performance optimized with memoization
 * - Consistent theme integration
 *
 * @component
 * @param {PageBreadcrumbsProps} props - The props for the PageBreadcrumbs component
 * @returns {JSX.Element} A styled breadcrumbs component
 */
const PageBreadcrumbs = memo(function PageBreadcrumbs({
  items,
  autoGenerate = true,
  showCurrentPage = true,
  homeLabel = "Dashboard",
  homePath = "/",
  truncateLabels = true,
  maxLabelLength = 25,
  onItemClick,
  sx,
  className,
  testId,
  showDivider = true,
}: PageBreadcrumbsProps) {
  const theme = useTheme();

  // Note: Custom route mapping is now handled centrally in the main Breadcrumbs component
  // through the getRouteMapping utility function

  return (
    <Stack
      className={className}
      data-testid={testId}
      component="nav"
      role="navigation"
      aria-label="Page breadcrumb navigation"
      sx={{
        mt: "-16px",
        mb: 3,
        width: "100%",
        position: "relative",
        ...sx,
      }}
    >
      <Stack
        direction="row"
        sx={{
          width: "100%",
          justifyContent: "space-between",
          alignItems: "flex-end",
          mb: 3,
          pt: 0,
        }}
      >
        <Breadcrumbs
          items={items}
          autoGenerate={autoGenerate}
          showCurrentPage={showCurrentPage}
          homeLabel={homeLabel}
          homePath={homePath}
          truncateLabels={truncateLabels}
          maxLabelLength={maxLabelLength}
          onItemClick={onItemClick}
          sx={{
            "py": 0.5,
            "px": 0,
            "& .MuiBreadcrumbs-separator": {
              color: theme.palette.text.disabled,
              mx: 0.5,
              fontSize: "14px",
            },
            "& .MuiBreadcrumbs-ol": {
              flexWrap: "wrap",
            },
          }}
        />
        <DashboardActionButtons hideOnMainDashboard={false} />
      </Stack>
      {showDivider && <Divider sx={{ mb: 2 }} />}
    </Stack>
  );
});

PageBreadcrumbs.displayName = "PageBreadcrumbs";

export { PageBreadcrumbs };
