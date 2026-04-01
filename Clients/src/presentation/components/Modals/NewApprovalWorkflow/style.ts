import { Theme } from "@mui/material";
import { text, background, border as borderPalette } from "../../../themes/palette";

export const addNewStep = {
    gap: "8px",
    minWidth: "80px",
    height: "34px",
    border: `1px solid ${borderPalette.dark}`,
    color: `${text.secondary}`,
    "&:hover": {
        backgroundColor: `${background.accent}`,
        border: `1px solid ${borderPalette.dark}`,
    },
};

export const stepNumberStyle = {
    display: "inline-flex",
    padding: "2px 8px",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "12px",
    background: "#11725B",
    borderRadius: "12px",
    color: `${background.main}`,
    fontSize: "14px",
    fontWeight: 600,
    minWidth: "24px",
}

export const entitySelectStyle = (theme: Theme) => ({
    width: "50%",
    backgroundColor: theme.palette.background.main,
})

export const stepContainerStyle = () => ({
    pt: 0
})

export const stepTitleStyle = {
    fontWeight: 500,
    fontSize: 16
}

export const removeStepLinkContainer = {
    flex: 1,
    display: "flex",
    justifyContent: "flex-start",
}

export const removeStepButtonStyle = (isFirstStep: boolean) => ({
    color: "#D92D20",
    backgroundColor: "transparent",
    border: "none",
    textTransform: "none" as const,
    fontSize: 13,
    fontWeight: 400,
    padding: "4px 8px",
    minWidth: "auto",
    "&:hover": {
        backgroundColor: "transparent",
        textDecoration: "underline",
    },
    visibility: isFirstStep ? "hidden" : "visible",
})

export const verticalStepDividerStyle = {
    borderRightWidth: "1px",
    height: "216px",
    borderColor: "#E0E0E0",
    mt: 4,
    ml: 6,
    mr: 12,
}

export const stepFieldsContainer = {
    flex: 1
}

export const approverAutocompleteStyle = (theme: Theme) => ({
    backgroundColor: theme.palette.background.main,
    "& .MuiOutlinedInput-root": {
        borderRadius: "3px",
        paddingTop: "3.8px !important",
        paddingBottom: "3.8px !important",
    },
    "& .MuiChip-root": {
        borderRadius: "4px",
        height: "24px",
        fontSize: "13px",
    },
})

export const conditionsSelectStyle = (theme: Theme) => ({
    width: "100%",
    backgroundColor: theme.palette.background.main,
})

export const descriptionFieldStyle = {
    maxHeight: "115px"
}

