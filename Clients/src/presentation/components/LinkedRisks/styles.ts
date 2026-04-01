import { brand, text, background } from "../../themes/palette";
export const textfieldStyle = {
  backgroundColor: `${background.main}`,
  "& input": {
    padding: "0 14px",
  },
};

export const styles = {
  textBase : {
    fontSize: "13px", 
    color: `${text.tertiary}`
  },
  textTitle : {
    fontSize: 16, 
    color: `${text.secondary}`, 
    fontWeight: "bold"
  },
  container: {
    width: "100%",
    backgroundColor: "#FCFCFD",
    padding: 10,
    borderRadius: "4px",
    gap: 10,
    justifyContent: "space-between",
    minHeight: "520px"
  },
  headingSection: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    width: '100%',
    marginBottom: "20px"
  },
  searchInputWrapper: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: "24px"
  },
  clearIconStyle: {
    color: `${text.muted}`, 
    cursor: "pointer"
  },
  CustomizableButton: {
    width: { xs: "100%", sm: 160 },
    backgroundColor: `${brand.primary}`,
    color: `${background.main}`,
    border: `1px solid ${brand.primary}`,
    gap: 2,
  },
  cancelBtn: {
    fontSize: "13px", 
    color: `${text.tertiary}`,
    marginRight: "27px"
  }
}