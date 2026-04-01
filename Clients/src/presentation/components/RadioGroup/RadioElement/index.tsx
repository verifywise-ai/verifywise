import styled from "styled-components";
import { Radio, RadioProps } from "@mui/material";
import { styles } from "./styles";
import { border as borderPalette } from "../../../themes/palette";

const BpIcon = styled("span")(() => ({ ...styles.BpIcon }));
const BpCheckedIcon = styled(BpIcon)({ ...styles.BpCheckedIcon });

const RadioElement = (props: RadioProps) => {
  return (
    <Radio
      disableRipple
      sx={{
        color: `${borderPalette.dark}`,
      }}
      checkedIcon={<BpCheckedIcon />}
      icon={<BpIcon />}
      {...props}
    />
  );
};

export default RadioElement;
