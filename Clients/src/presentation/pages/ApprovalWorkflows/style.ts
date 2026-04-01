import { Theme } from "@mui/material";
import { CSSProperties } from "styled-components";
import { brand, background } from "../../themes/palette";

// Main page styles (index.tsx)
export const workflowMainStack = {
    gap: "16px",
};

export const filterSearchContainer = {
    mb: 2,
};

// Table row styles
export const workflowRowHover = {
    "&:hover": { backgroundColor: "#FBFBFB", cursor: "pointer" },
};

export const workflowTableRowDeletingStyle = {
    opacity: 0.6,
    backgroundColor: `${background.surface}`,
};

export const addNewWorkflowButton = {
    backgroundColor: `${brand.primary}`,
    border: `1px solid ${brand.primary}`,
    gap: "8px",
};

// Pagination & footer
export const workflowFooterRow = (theme: Theme) => ({
    "& .MuiTableCell-root.MuiTableCell-footer": {
        paddingX: theme.spacing(8),
        paddingY: theme.spacing(4),
    },
});

export const workflowShowingText = (theme: Theme) => ({
    paddingX: theme.spacing(2),
    fontSize: 11,
    opacity: 0.7,
    fontWeight: 400,
    whiteSpace: 'nowrap' as const,
});

export const workflowPaginationMenu = (theme: Theme) => ({
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

export const workflowPaginationSelect = (theme: Theme) => ({
    ml: theme.spacing(4),
    mr: theme.spacing(12),
    minWidth: theme.spacing(20),
    textAlign: "left" as const,
    "&.Mui-focused > div": {
        backgroundColor: theme.palette.background.main,
    },
});

export const workflowPagination = (theme: Theme) => ({
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

// Table container
export const tableContainerStyle = {
    overflowX: "auto" as const,
};

// Header cell styles
export const headerCellEntityStyle = {
    width: "18%",
};

export const headerCellStepsStyle = {
    width: "15%",
};

export const headerCellDateStyle = {
    width: "22%",
};

export const headerCellActionsStyle = (backgroundColor: string) => ({
    position: "sticky" as const,
    right: 0,
    zIndex: 10,
    width: "12%",
    backgroundColor,
});

export const sortableHeaderStyle = {
    cursor: "pointer" as const,
    userSelect: "none" as const,
    "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.04)",
    },
};

export const headerContentBoxStyle = (theme: Theme) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing(2),
});

export const headerLabelStyle = (isActive: boolean, theme?: Theme) => ({
    fontWeight: 400,
    color: isActive && theme ? theme.palette.primary.main : "inherit",
});

export const sortIconBoxStyle = (isActive: boolean, theme?: Theme) => ({
    display: "flex",
    alignItems: "center",
    color: isActive && theme ? theme.palette.primary.main : "text.disabled",
});

// Body cell styles
export const bodyCellTitleStyle = (cellStyle: CSSProperties, isHighlighted: boolean) => ({
    ...cellStyle,
    backgroundColor: isHighlighted ? "background.surface" : "#fafafa",
});

export const bodyCellEntityStyle = (cellStyle: CSSProperties, isHighlighted: boolean) => ({
    ...cellStyle,
    width: "18%",
    backgroundColor: isHighlighted ? "background.surface" : "background.main",
});

export const bodyCellStepsStyle = (cellStyle: CSSProperties, isHighlighted: boolean) => ({
    ...cellStyle,
    width: "15%",
    backgroundColor: isHighlighted ? "background.surface" : "background.main",
});

export const bodyCellDateStyle = (cellStyle: CSSProperties, isHighlighted: boolean) => ({
    ...cellStyle,
    width: "22%",
    backgroundColor: isHighlighted ? "background.surface" : "background.main",
});

export const bodyCellActionsStyle = (cellStyle: CSSProperties) => ({
    ...cellStyle,
    width: "12%",
    backgroundColor: "background.main",
});

export const actionStackStyle = {
    direction: "row" as const,
    spacing: 1,
};

export const emptyTableCellStyle = {
    py: 4,
};