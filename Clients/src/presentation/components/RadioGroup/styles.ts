import { text } from "../../themes/palette";
export const labelStyle = (theme: any) => ({  
  '& .MuiFormControlLabel-label': { 
    color: `${text.tertiary}`,
    fontSize: theme.typography.fontSize,
  }  
})