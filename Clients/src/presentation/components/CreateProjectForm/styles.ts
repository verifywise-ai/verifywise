import { Theme } from "@mui/material/styles";
import { background } from "../../themes/palette";

export const createProjectFormStyles = {
  formContainer: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: 20,
    rowGap: 8,
    mt: 13.5,
  },
  
  leftColumn: {
    rowGap: 8,
  },
  
  fieldStyle: (theme: Theme) => ({
    backgroundColor: theme.palette.background.main,
    "& input": {
      padding: "0 14px",
    },
  }),
  
  selectStyle: (theme: Theme) => ({
    width: "350px",
    backgroundColor: theme.palette.background.main,
  }),
  
  teamMembersTitle: (theme: Theme) => ({
    fontSize: theme.typography.fontSize,
    fontWeight: 500,
    mb: 2,
  }),
  
  autocompleteContainer: (theme: Theme) => ({
    width: "350px",
    backgroundColor: theme.palette.background.main,
    "& .MuiOutlinedInput-root": {
      borderRadius: "3px",
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: "none",
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "#888",
        borderWidth: "1px",
      },
    },
    "& .MuiChip-root": {
      borderRadius: "4px",
    },
  }),
  
  autocompleteTextField: {
    "& .MuiOutlinedInput-root": {
      paddingTop: "3.8px !important",
      paddingBottom: "3.8px !important",
    },
    "& ::placeholder": {
      fontSize: "13px",
    },
  },
  
  autocompleteOptionText: {
    fontSize: "13px",
  },
  
  autocompleteEmailText: {
    fontSize: "11px",
    color: "rgb(157, 157, 157)",
    position: "absolute",
    right: "9px",
  },
  
  autocompleteSlotProps: {
    paper: {
      sx: {
        "& .MuiAutocomplete-listbox": {
          "& .MuiAutocomplete-option": {
            fontSize: "13px",
            color: "#1c2130",
            paddingLeft: "9px",
            paddingRight: "9px",
          },
          "& .MuiAutocomplete-option.Mui-focused": {
            background: `${background.accent}`,
          },
        },
        "& .MuiAutocomplete-noOptions": {
          fontSize: "13px",
          paddingLeft: "9px",
          paddingRight: "9px",
        },
      },
    },
  },
  
  errorText: {
    mt: 4,
    color: "#f04438",
    fontWeight: 300,
  },
  
  rightColumnContainer: {
    rowGap: 8,
    mt: 8,
  },
  
  datePicker: {
    width: "130px",
  },
  
  goalField: (theme: Theme) => ({
    backgroundColor: theme.palette.background.main,
  }),
  
  submitButton: {
    borderRadius: 2,
    maxHeight: 34,
    textTransform: "inherit",
    backgroundColor: "#4C7DE7",
    boxShadow: "none",
    border: "1px solid #175CD3",
    ml: "auto",
    mr: 0,
    mt: "30px",
    "&:hover": { 
      boxShadow: "none", 
      backgroundColor: "#175CD3",
    },
  },
} as const;