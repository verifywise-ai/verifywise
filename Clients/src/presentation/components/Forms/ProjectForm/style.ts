import { brand, text, background, border as borderPalette } from "../../../themes/palette";
export const textfieldStyle = {
  backgroundColor: `${background.main}`,
  "& input": {
    padding: "0 14px",
  },
};

export const dropdownStyle = {
  width: "350px",
  backgroundColor: `${background.main}`,
};

export const createProjectButtonStyle = {
  backgroundColor: `${brand.primary}`,
  border: `1px solid ${brand.primary}`,
  gap: 2,
};

export const datePickerStyle = {
  width: "130px",
};

export const teamMembersRenderInputStyle = {
  "& .MuiOutlinedInput-root": {
    paddingTop: "3.8px !important",
    paddingBottom: "3.8px !important",
  },
  "& ::placeholder": {
    fontSize: "13px",
  },
};

export const teamMembersSxStyle = {
  width: "100%",
  "& .MuiChip-root": {
    borderRadius: "4px",
  },
};

export const teamMembersSlotProps = {
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
};

export const radioGroupStyle = {
  width: "100%",
  gap: 2,
};

export const radioOptionStyle = {
  width: "100%",
  padding: "16px",
  border: "1px solid #E4E7EC",
  borderRadius: "4px",
  backgroundColor: `${background.main}`,
  cursor: "pointer",
  transition: "all 0.2s ease-in-out",
  "&:hover": {
    borderColor: `${brand.primary}`,
    backgroundColor: "#F9F9F9",
  },
  "&.selected": {
    borderColor: `${brand.primary}`,
    backgroundColor: "#F0F9F6",
  },
};

export const continueButtonStyle = {
  backgroundColor: `${brand.primary}`,
  border: `1px solid ${brand.primary}`,
  gap: 2,
  marginTop: 2,
};

export const backButtonStyle = {
  backgroundColor: `${background.main}`,
  border: `1px solid ${borderPalette.dark}`,
  color: `${text.secondary}`,
  gap: 2,
  "&:hover": {
    backgroundColor: "#F9F9F9",
    border: `1px solid ${borderPalette.dark}`,
  },
};
