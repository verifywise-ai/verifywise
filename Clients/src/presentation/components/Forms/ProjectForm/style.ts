import {
  brand,
  text,
  background,
  border as borderPalette,
  palette as vwPalette,
  radiusPx,
} from "../../../themes/palette";
export const textfieldStyle = {
  "backgroundColor": `${background.main}`,
  "& input": {
    padding: "0 14px",
  },
};

export const createProjectButtonStyle = {
  backgroundColor: `${brand.primary}`,
  border: `1px solid ${brand.primary}`,
  gap: 2,
};

export const datePickerStyle = {
  width: "130px",
};

export const teamMembersSxStyle = {
  "width": "100%",
  "& .MuiChip-root": {
    borderRadius: radiusPx.sm,
  },
};

export const teamMembersSlotProps = {
  paper: {
    sx: {
      "& .MuiAutocomplete-listbox": {
        "& .MuiAutocomplete-option": {
          fontSize: "13px",
          color: vwPalette.text.primary,
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
};

export const radioGroupStyle = {
  width: "100%",
  gap: 2,
};

export const radioOptionStyle = {
  "width": "100%",
  "padding": "16px",
  "border": `1px solid ${vwPalette.border.light}`,
  "borderRadius": radiusPx.sm,
  "backgroundColor": `${background.main}`,
  "cursor": "pointer",
  "transition": "all 0.2s ease-in-out",
  "&:hover": {
    borderColor: `${brand.primary}`,
    backgroundColor: vwPalette.background.alt,
  },
  "&.selected": {
    borderColor: `${brand.primary}`,
    backgroundColor: vwPalette.background.fill,
  },
};

export const continueButtonStyle = {
  backgroundColor: `${brand.primary}`,
  border: `1px solid ${brand.primary}`,
  gap: 2,
  marginTop: 2,
};

export const backButtonStyle = {
  "backgroundColor": `${background.main}`,
  "border": `1px solid ${borderPalette.dark}`,
  "color": `${text.secondary}`,
  "gap": 2,
  "&:hover": {
    backgroundColor: vwPalette.background.alt,
    border: `1px solid ${borderPalette.dark}`,
  },
};
