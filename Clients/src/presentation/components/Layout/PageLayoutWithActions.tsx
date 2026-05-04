import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { PageBreadcrumbs } from "../breadcrumbs/PageBreadcrumbs";
import { DashboardActionButtons } from "./DashboardActionButtons";
import { BreadcrumbItem } from "../../types/interfaces/i.breadcrumbs";

interface PageLayoutWithActionsProps {
  children: ReactNode;
  breadcrumbItems?: BreadcrumbItem[];
  showBreadcrumbs?: boolean;
  showActionButtons?: boolean;
  title?: string;
  description?: string;
  autoGenerateBreadcrumbs?: boolean;
  showCurrentPage?: boolean;
}

export function PageLayoutWithActions({
  children,
  breadcrumbItems,
  showBreadcrumbs = true,
  showActionButtons = true,
  title,
  description,
  autoGenerateBreadcrumbs = true,
  showCurrentPage = true,
}: PageLayoutWithActionsProps) {
  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      {showActionButtons && <DashboardActionButtons />}

      {showBreadcrumbs && (
        <PageBreadcrumbs
          items={breadcrumbItems}
          autoGenerate={autoGenerateBreadcrumbs}
          showCurrentPage={showCurrentPage}
        />
      )}

      {title && (
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: "text.primary",
              mb: 1,
            }}
          >
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
      )}

      {children}
    </Box>
  );
}
