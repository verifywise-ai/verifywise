import { Theme } from "@mui/material";
import { brand, background } from "../../../themes/palette";

export const getToggleStyles = (theme: Theme) => ({
  width: 34,
  height: 18,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: '2px',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: `${background.main}`,
      '& + .MuiSwitch-track': {
        backgroundColor: `${brand.primary}`,
        opacity: 1,
        border: 0,
      },
    },
  },
  '& .MuiSwitch-thumb': {
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    width: 14,
    height: 14,
    borderRadius: '50%',
    backgroundColor: `${background.main}`,
  },
  '& .MuiSwitch-track': {
    borderRadius: 9,
    backgroundColor: theme.palette.border.dark,
    opacity: 1,
    transition: theme.transitions.create(['background-color'], {
      duration: 200,
    }),
  },
});
