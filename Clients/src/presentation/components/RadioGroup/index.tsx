import React from "react";
import { FormControl, RadioGroup, FormControlLabel } from "@mui/material";
import RadioElement from "./RadioElement";
import { labelStyle } from "./styles";

interface RadioProps {
  values: string[];
  defaultValue: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const RadioComponent: React.FC<RadioProps> = ({ values, defaultValue, onChange }) => {
  return (
    <FormControl>
      <RadioGroup
        aria-labelledby="radio-buttons-group-label"
        defaultValue={defaultValue}
        name="radio-buttons-group"
        onChange={onChange}
      >
        {values.map((value, index) => (
          <FormControlLabel
            key={index}
            value={value}
            control={<RadioElement />}
            label={value}
            sx={(theme) => labelStyle(theme)}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
};

export default RadioComponent;
