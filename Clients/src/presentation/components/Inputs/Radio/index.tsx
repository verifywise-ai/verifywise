/**
 * Radio component that renders a custom radio button with a label and description.
 *
 * @param {RadioProps} props - The properties for the Radio component.
 * @param {boolean} props.checked - Indicates whether the radio button is checked.
 * @param {string} props.value - The value of the radio button.
 * @param {string} props.id - The id of the radio button.
 * @param {"small" | "medium"} props.size - The size of the radio button.
 * @param {(event: ChangeEvent<HTMLInputElement>) => void} props.onChange - The function to call when the radio button state changes.
 * @param {string} props.title - The title to display next to the radio button.
 * @param {string} props.desc - The description to display below the title.
 *
 * @returns {JSX.Element} The rendered Radio component.
 */

import { FormControlLabel, useTheme, Radio as MUIRadio, Typography } from "@mui/material";
import "./index.css";

import { CircleDot } from "lucide-react";

import { ChangeEvent } from "react";

interface RadioProps {
  checked: boolean;
  value: string;
  id: string;
  size: "small" | "medium";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  title: string;
  desc: string;
}

function Radio({ checked, value, id, size, onChange, title, desc }: RadioProps) {
  const theme = useTheme();

  return (
    <FormControlLabel
      className="custom-radio-button"
      checked={checked}
      value={value}
      control={
        <MUIRadio
          id={id}
          size={size}
          checkedIcon={<CircleDot size={16} />}
          sx={{
            color: "transparent",
            width: 16,
            height: 16,
            boxShadow: "inset 0 0 0 1px #656a74",
            mt: theme.spacing(0.5),
          }}
        />
      }
      onChange={(event) => onChange(event as ChangeEvent<HTMLInputElement>)}
      label={
        <>
          <Typography fontSize={13} color="text.tertiary">
            {title}
          </Typography>
          <Typography component="h6" mt={theme.spacing(1)} color={theme.palette.text.secondary}>
            {desc}
          </Typography>
        </>
      }
      labelPlacement="end"
      sx={{
        "alignItems": "flex-start",
        "p": theme.spacing(2.5),
        "m": theme.spacing(-2.5),
        "borderRadius": theme.shape.borderRadius,
        "&:hover": {
          backgroundColor: theme.palette.background.accent,
        },
        "& .MuiButtonBase-root": {
          p: 0,
          mr: theme.spacing(6),
        },
      }}
    />
  );
}

export default Radio;
