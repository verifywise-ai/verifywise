import { Theme, SxProps } from "@mui/material/styles";
import { AIIncidentManagementApprovalStatus } from "../../../domain/enums/aiIncidentManagement.enum";
import { brand } from "../../themes/palette";

// Main page styles (index.tsx)
export const incidentMainStack = {
    gap: "16px",
};

export const incidentFilterRow = {
    gap: "16px",
};

export const incidentToastContainer = {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
};

export const incidentStatusSelect = {
    width: "200px",
    minHeight: "34px",
};

export const addNewIncidentButton = {
    backgroundColor: `${brand.primary}`,
    border: `1px solid ${brand.primary}`,
    gap: "8px",
};

// Summary component styles (IncidentSummary.tsx)
export const incidentSummaryContainer = {
    marginBottom: "20px",
    gap: "20px",
    flexWrap: "wrap" as const,
};

export const incidentSummaryCard = (theme: Theme) => ({
    flex: 1,
    minWidth: "200px",
    backgroundColor: "white",
    border: `1px solid ${theme.palette.border.light}`,
    borderRadius: theme.shape.borderRadius,
    padding: "20px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: "20px",
});

export const incidentSummaryCount = (color: string) => ({
    fontWeight: 700,
    color,
    fontSize: "2rem",
    margin: 0,
});

export const incidentSummaryLabel = (theme: Theme) => ({
    fontSize: 13,
    fontWeight: 400,
    color: theme.palette.text.secondary,
    textTransform: "uppercase" as const,
    margin: 0,
});

// Table component styles (IncidentTable.tsx)
export const incidentStatusBadge = (
    status: AIIncidentManagementApprovalStatus
) => {
    const statusStyles = {
        [AIIncidentManagementApprovalStatus.APPROVED]: {
            bg: "#E6F4EA",
            color: "status.success.text",
        },
        [AIIncidentManagementApprovalStatus.REJECTED]: {
            bg: "#FFF8E1",
            color: "#795548",
        },
        [AIIncidentManagementApprovalStatus.PENDING]: {
            bg: "#FFE5D0",
            color: "#E64A19",
        },
        [AIIncidentManagementApprovalStatus.NOT_REQUIRED]: {
            bg: "#FFD6D6",
            color: "status.error.text",
        },
    };

    const style = statusStyles[status] || { bg: "#E0E0E0", color: "#424242" };

    return {
        backgroundColor: style.bg,
        color: style.color,
        padding: "4px 8px",
        borderRadius: 4,
        fontWeight: 500,
        fontSize: 11,
        textTransform: "uppercase" as const,
        display: "inline-block" as const,
    };
};

export const incidentSeverityBadge = (isCritical: boolean) => {
    const style = isCritical
        ? { bg: "#FFD6D6", color: "status.error.text" }
        : { bg: "#E6F4EA", color: "status.success.text" };

    return {
        backgroundColor: style.bg,
        color: style.color,
        padding: "4px 8px",
        borderRadius: 4,
        fontWeight: 500,
        fontSize: 11,
        textTransform: "uppercase" as const,
        display: "inline-block" as const,
    };
};

// Tags / Chips
export const incidentTagContainer = {
    gap: "8px",
};

export const incidentTag = {
    fontSize: 11,
    height: "20px",
    backgroundColor: "background.surface",
    borderRadius: 4,
    color: "#666",
    margin: 0,
    fontWeight: 500,
};

export const incidentTagExtra = {
    fontSize: 11,
    height: "20px",
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    color: "#666",
    margin: 0,
    fontWeight: 500,
};

// Table row styles
export const incidentRowHover = {
    "&:hover": { backgroundColor: "#FBFBFB", cursor: "pointer" },
};

export const incidentRowDisabled = {
    opacity: 0.6,
    backgroundColor: "background.surface",
};

// Empty / Loading states
export const incidentLoadingContainer = () => ({
    border: "1px solid #EEEEEE",
    borderRadius: "4px",
    padding: "60px 20px",
    minHeight: 200,
});

export const incidentEmptyContainer = () => ({
    border: "1px solid #EEEEEE",
    borderRadius: "4px",
    padding: "60px 20px 80px 20px",
    gap: "20px",
    minHeight: 200,
});

export const incidentEmptyText = {
    fontSize: 13,
    color: "text.tertiary",
    margin: 0,
    fontWeight: 400,
};

// Pagination & footer
export const incidentFooterRow = (theme: Theme) => ({
    "& .MuiTableCell-root.MuiTableCell-footer": {
        paddingX: theme.spacing(8),
        paddingY: theme.spacing(4),
    },
});

export const incidentShowingText = (theme: Theme) => ({
    paddingX: theme.spacing(2),
    fontSize: 11,
    opacity: 0.7,
    fontWeight: 400,
    whiteSpace: 'nowrap' as const,
    // Note: This will be replaced by singleTheme.tableStyles.primary.footer.cell in the future
});

export const incidentPaginationMenu = (theme: Theme) => ({
    keepMounted: true,
    PaperProps: {
        className: "pagination-dropdown",
        sx: {
            mt: 0,
            mb: theme.spacing(2),
        },
    },
    transformOrigin: {
        vertical: "bottom" as const,
        horizontal: "left" as const,
    },
    anchorOrigin: {
        vertical: "top" as const,
        horizontal: "left" as const,
    },
    sx: { mt: theme.spacing(-2) },
});

export const incidentPaginationSelect = (theme: Theme) => ({
    ml: theme.spacing(4),
    mr: theme.spacing(12),
    minWidth: theme.spacing(20),
    textAlign: "left" as const,
    "&.Mui-focused > div": {
        backgroundColor: theme.palette.background.main,
    },
});

export const incidentPagination = (theme: Theme) => ({
    mt: theme.spacing(6),
    color: theme.palette.text.secondary,
    "& .MuiSelect-icon": {
        width: "24px",
        height: "fit-content",
    },
    "& .MuiSelect-select": {
        width: theme.spacing(10),
        borderRadius: theme.shape.borderRadius,
        border: `1px solid ${theme.palette.border.light}`,
        padding: theme.spacing(4),
    },
});

// Search bar
export const incidentSearchBox =
    (isVisible: boolean): SxProps<Theme> =>
    (theme: Theme) => ({
        display: "flex",
        alignItems: "center",
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: theme.shape.borderRadius,
        p: "1px 1px",
        backgroundColor: "background.main",
        width: isVisible ? "50%" : "auto",
        transition: "all 0.3s ease",
        mb: 9,
    });

export const incidentInput = (isVisible: boolean): SxProps<Theme> => ({
    flex: 1,
    fontSize: "14px",
    opacity: isVisible ? 1 : 0,
    transition: "opacity 0.3s ease",
});

export const incidentManagementCard = {
    minWidth: "fit-content",
    width: { xs: "100%", sm: "fit-content" },
    height: "100%",
    display: "flex",
    flexDirection: { xs: "column", sm: "row" },
    gap: "16px",
    overflow: "auto",
  };
  
  export const incidentManagementTileCard = {
    paddingY: { xs: "10px", sm: "15px" },
    paddingX: { xs: "15px", sm: "30px" },
    textAlign: "center",
    fontWeight: 600,

    position: "relative",
    cursor: "default",
    minWidth: { xs: "120px", sm: "140px" },
    width: { xs: "120px", sm: "140px" },
    backgroundColor: "background.main",
    border: "1px solid status.default.border",
    borderRadius: 2,
  };
  
  export const incidentManagementCardKey = {
    fontSize: 13,
  };
  
  export const incidentManagementCardValue = {
    fontSize: 28,
    fontWeight: 800,
  };

  export const incidentTableRowDeletingStyle = {
    opacity: 0.6,
    backgroundColor: "background.surface",
  };
