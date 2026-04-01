import { Theme } from "@mui/material";

export const getDatePickerStyle = (theme: Theme) => ({
  backgroundColor: theme.palette.background.paper,
  ".MuiIconButton-root:hover": { backgroundColor: "unset" },
  "& svg": { display: "none" },
  // Icon button positioning (MUI v8 uses MuiInputAdornment-root)
  "& .MuiInputAdornment-root": {
    position: "absolute",
    left: "4px",
    top: "50%",
    transform: "translateY(-50%)",
    marginTop: "1px",
    marginRight: 0,
    zIndex: 1,
  },
  "& .MuiInputAdornment-root button": {
    width: "20px",
    height: "20px",
    padding: 0,
  },
  "& .MuiInputAdornment-root button:before": {
    content: "url('/assets/icons/calendar.svg')",
    display: "block",
  },
  // MUI v8 DatePicker uses sectionsContainer for the date display
  "& .MuiPickersOutlinedInput-root": {
    backgroundColor: theme.palette.background.paper,
    borderRadius: "4px",
    paddingLeft: "40px !important",
  },
  "& .MuiPickersInputBase-sectionsContainer": {
    paddingLeft: "0 !important",
    fontSize: "13px !important",
  },
  "& .MuiPickersInputBase-sectionContent": {
    fontSize: "13px !important",
  },
  // Hide the input element - MUI v8 uses sectionsContainer for visible date display
  "& .MuiPickersInputBase-input, & .MuiPickersOutlinedInput-input": {
    fontSize: "13px !important",
    position: "absolute !important",
    opacity: 0,
    pointerEvents: "none",
  },
  "& .MuiOutlinedInput-root": {
    backgroundColor: theme.palette.background.paper,
    borderRadius: "4px",
  },
  // Hover state for MUI v8 DatePicker
  "& .MuiPickersOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: `${theme.palette.primary.light} !important`,
  },
  "& .MuiPickersOutlinedInput-root:hover fieldset": {
    borderColor: `${theme.palette.primary.light} !important`,
  },
  // Focus state with green border for MUI v8 DatePicker
  "& .MuiPickersOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: `${theme.palette.primary.main} !important`,
    borderWidth: "2px",
    boxShadow: `0 0 0 3px ${theme.palette.primary.main}1A`,
  },
  "& .MuiPickersOutlinedInput-root.Mui-focused fieldset": {
    borderColor: `${theme.palette.primary.main} !important`,
    borderWidth: "2px",
    boxShadow: `0 0 0 3px ${theme.palette.primary.main}1A`,
  },
});

// Keep backward-compatible static export for existing consumers
export const DatePickerStyle = {
  backgroundColor: "background.main",
  ".MuiIconButton-root:hover": { backgroundColor: "unset" },
  "& svg": { display: "none" },
  "& .MuiInputAdornment-root": {
    position: "absolute",
    left: "4px",
    top: "50%",
    transform: "translateY(-50%)",
    marginTop: "1px",
    marginRight: 0,
    zIndex: 1,
  },
  "& .MuiInputAdornment-root button": {
    width: "20px",
    height: "20px",
    padding: 0,
  },
  "& .MuiInputAdornment-root button:before": {
    content: "url('/assets/icons/calendar.svg')",
    display: "block",
  },
  "& .MuiPickersOutlinedInput-root": {
    backgroundColor: "background.main",
    borderRadius: "4px",
    paddingLeft: "40px !important",
  },
  "& .MuiPickersInputBase-sectionsContainer": {
    paddingLeft: "0 !important",
    fontSize: "13px !important",
  },
  "& .MuiPickersInputBase-sectionContent": {
    fontSize: "13px !important",
  },
  "& .MuiPickersInputBase-input, & .MuiPickersOutlinedInput-input": {
    fontSize: "13px !important",
    position: "absolute !important",
    opacity: 0,
    pointerEvents: "none",
  },
  "& .MuiOutlinedInput-root": {
    backgroundColor: "background.main",
    borderRadius: "4px",
  },
  "& .MuiPickersOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#5FA896 !important",
  },
  "& .MuiPickersOutlinedInput-root:hover fieldset": {
    borderColor: "#5FA896 !important",
  },
  "& .MuiPickersOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "brand.primary !important",
    borderWidth: "2px",
    boxShadow: "0 0 0 3px rgba(19, 113, 91, 0.1)",
  },
  "& .MuiPickersOutlinedInput-root.Mui-focused fieldset": {
    borderColor: "brand.primary !important",
    borderWidth: "2px",
    boxShadow: "0 0 0 3px rgba(19, 113, 91, 0.1)",
  },
};
